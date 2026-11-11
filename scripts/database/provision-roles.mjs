import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { administratorConnection, restrictedUrl, DeploymentError } from './connection.mjs';

process.umask(0o077);
const loginRoles = ['pactum_app', 'pactum_jobs', 'pactum_migrator'];
const roles = [...loginRoles, 'pactum_runtime', 'pactum_worker', 'pactum_policy_reader'];
let client, transaction = false, lock;

function privatePath(filename, directory = false) {
  const stat = fs.lstatSync(filename);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) ||
      (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) {
    throw new DeploymentError('Credential paths must be owner-only, owned by this user, and must not be symlinks.');
  }
}

function writePrivate(filename, data) {
  if (fs.existsSync(filename)) privatePath(filename);
  const temporary = `${filename}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, data, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally { fs.rmSync(temporary, { force: true }); }
}

try {
  if (process.argv.slice(2).some(arg => !['--apply','--prepare'].includes(arg)) || process.argv.includes('--apply') && process.argv.includes('--prepare')) throw new DeploymentError('Use --prepare for local credential preparation, --apply for provisioning, or neither for read-only preflight.');
  const apply = process.argv.includes('--apply');
  const prepare = process.argv.includes('--prepare');
  const target = administratorConnection();
  client = new Client(target.config);
  await client.connect();
  const { rows: [access] } = await client.query(`SELECT current_user administrator, current_setting('server_version_num')::int version,
    r.rolcreaterole, (to_regnamespace('pactum') IS NOT NULL OR has_database_privilege(current_user,current_database(),'CREATE')) schema_bootstrap,
    has_schema_privilege(current_user,'auth','USAGE') auth_usage,
    has_column_privilege(current_user,'auth.users','id','REFERENCES') auth_reference,
    (SELECT bool_and(has_column_privilege(current_user,'auth.users',col,'SELECT')) FROM unnest(ARRAY['id','email','deleted_at']) col) auth_users,
    (SELECT bool_and(has_column_privilege(current_user,'auth.sessions',col,'SELECT')) FROM unnest(ARRAY['id','user_id','not_after']) col) auth_sessions
    FROM pg_roles r WHERE r.rolname=current_user`);
  if (!access || access.version < 160000 || !['rolcreaterole','schema_bootstrap','auth_usage','auth_reference','auth_users','auth_sessions'].every(key => access[key])) {
    throw new DeploymentError('Bootstrap needs PostgreSQL 16+, CREATEROLE, schema creation/ownership, and existing Auth SELECT/REFERENCES privileges.');
  }
  if (!target.local && access.administrator !== 'postgres') throw new DeploymentError('The session is not the intended Supabase postgres administrator.');
  const existing = (await client.query(`SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls
    FROM pg_roles WHERE rolname=ANY($1) ORDER BY rolname`, [roles])).rows;
  if (existing.some(role => role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolbypassrls || !role.rolinherit || role.rolcanlogin !== loginRoles.includes(role.rolname))) {
    throw new DeploymentError('Unexpected privileges on existing PACTRA roles. No automatic privilege repair is performed.');
  }
  const memberships = (await client.query(`SELECT member.rolname member,parent.rolname parent,m.admin_option,m.inherit_option,m.set_option
    FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid
    WHERE member.rolname=ANY($1)`, [roles])).rows;
  const expected = { pactum_app: 'pactum_runtime', pactum_jobs: 'pactum_worker', pactum_migrator: 'pactum_policy_reader' };
  if (memberships.some(m => expected[m.member] !== m.parent || m.admin_option || !m.inherit_option || !m.set_option)) {
    throw new DeploymentError('Unexpected role memberships or membership options. Review existing grants before provisioning.');
  }
  const schema = (await client.query("SELECT pg_get_userbyid(nspowner) owner FROM pg_namespace WHERE nspname='pactum'")).rows[0];
  if (schema && schema.owner !== 'pactum_migrator') throw new DeploymentError('Existing pactum schema ownership differs from the reviewed model.');
  console.log(JSON.stringify({ target: { host: target.identity.host, database: target.identity.database, project: target.project },
    mode: apply ? 'provision' : prepare ? 'prepare-local-files' : 'read-only', bootstrapReady: true, serverVersion: access.version, roles: existing }));

  if (apply || prepare) {
    const digest = crypto.createHash('sha256').update(JSON.stringify(target.identity)).digest('hex').slice(0, 16);
    const root = process.env.PACTRA_CREDENTIAL_ROOT || path.join(os.homedir(), '.local/share/pactra/database-credentials');
    const relativeRoot = path.relative(process.cwd(), root);
    if (!path.isAbsolute(root) || !(relativeRoot.startsWith('..' + path.sep) || path.isAbsolute(relativeRoot))) throw new DeploymentError('Credential storage must use an absolute path outside the repository.');
    fs.mkdirSync(root, { recursive: true, mode: 0o700 }); privatePath(root, true);
    const directory = path.join(root, digest);
    fs.mkdirSync(directory, { mode: 0o700, recursive: true }); privatePath(directory, true);
    const lockPath = path.join(directory, 'provision.lock');
    const descriptor = fs.openSync(lockPath, 'wx', 0o600);
    fs.closeSync(descriptor); lock = lockPath;
    const file = path.join(directory, 'credentials.json');
    const saved = fs.existsSync(file);
    if (saved) privatePath(file);
    const credentials = saved ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
      identity: target.identity, passwords: Object.fromEntries(loginRoles.map(role => [role, crypto.randomBytes(32).toString('hex')])),
    };
    if (JSON.stringify(credentials.identity) !== JSON.stringify(target.identity) ||
        JSON.stringify(Object.keys(credentials.passwords || {}).sort()) !== JSON.stringify([...loginRoles].sort()) ||
        Object.values(credentials.passwords).some(password => typeof password !== 'string' || !/^[a-f0-9]{64}$/.test(password))) {
      throw new DeploymentError('Credential registry is incomplete or does not match this target.');
    }
    if (!saved && existing.some(role => loginRoles.includes(role.rolname))) throw new DeploymentError('Existing login credentials need operator review; automatic password rotation is disabled.');
    const existingLogins = new Set(existing.filter(role => loginRoles.includes(role.rolname)).map(role => role.rolname));
    for (const role of existingLogins) {
      const probe = new Client({ ...target.config, user: target.local ? role : `${role}.${target.project}`, password: credentials.passwords[role] });
      try { await probe.connect(); await probe.query('SELECT current_user'); }
      catch { throw new DeploymentError('Saved credentials do not authenticate an existing login. Password rotation requires explicit operator review.'); }
      finally { await probe.end().catch(() => {}); }
    }
    // Persist retry credentials before committing any role passwords to the database.
    if (!saved) writePrivate(file, JSON.stringify(credentials));
    if (apply) {
      await client.query('BEGIN'); transaction = true;
      await client.query(fs.readFileSync(fileURLToPath(new URL('./bootstrap.sql', import.meta.url)), 'utf8'));
      for (const role of loginRoles) if (!existingLogins.has(role)) await client.query(`ALTER ROLE "${role}" PASSWORD '${credentials.passwords[role]}'`);
      await client.query('COMMIT'); transaction = false;
    }
    const makeUrl = (role, runtime = false) => restrictedUrl(target, role, credentials.passwords[role], runtime);
    writePrivate(path.join(directory, 'runtime.env'), `DATABASE_URL=${makeUrl('pactum_app', true)}\nWORKER_DATABASE_URL=${makeUrl('pactum_jobs', true)}\n`);
    writePrivate(path.join(directory, 'migration.env'), `DATABASE_URL=${makeUrl('pactum_migrator')}\nDIRECT_URL=${makeUrl('pactum_migrator')}\n`);
    console.log(`Restricted credentials saved privately to ${directory}. Import runtime.env only into the application secret manager.`);
    if (prepare) console.log('Prepared local files only. No database changes were executed. Credentials become active only after the operator runs --apply.');
  }
} catch (error) {
  if (transaction) await client?.query('ROLLBACK').catch(() => {});
  console.error('Database role provisioning stopped.', error instanceof DeploymentError ? error.message : (error.code || error.name));
  process.exitCode = 1;
} finally {
  if (lock) fs.rmSync(lock, { force: true });
  await client?.end().catch(() => {});
}
