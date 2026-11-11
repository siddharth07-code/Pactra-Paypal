import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

process.umask(0o077);
const apply = process.argv.includes('--apply');
const source = process.env.BOOTSTRAP_DATABASE_URL || process.env.DIRECT_URL;
if (!source) throw new Error('Set BOOTSTRAP_DATABASE_URL for the controlled database administrator.');
let target;
try { target = new URL(source); }
catch { throw new Error('A valid PostgreSQL bootstrap connection is required.'); }
if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('PostgreSQL connection required.');
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
if (!local && (target.port !== '5432' || !target.hostname.endsWith('.pooler.supabase.com'))) throw new Error('Use the Supabase Session Pooler on port 5432.');
const ssl = local ? false : { rejectUnauthorized: true, ca: fs.readFileSync(process.env.DATABASE_CA_FILE, 'utf8') };
const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };
const client = new Client({ host: target.hostname, port: Number(target.port || 5432), database: target.pathname.slice(1), user: decode(target.username), password: decode(target.password), ssl, connectionTimeoutMillis: 15000, query_timeout: 30000 });
const identity = { host: target.hostname, port: target.port || '5432', database: target.pathname.slice(1), bootstrapRole: decode(target.username) };
const digest = crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16);
const directory = path.join(os.homedir(), '.local/share/pactra/database-credentials', digest);
let transaction = false;
try {
  await client.connect();
  const { rows: [access] } = await client.query("SELECT r.rolcreaterole, (to_regnamespace('pactum') IS NOT NULL OR has_database_privilege(current_user,current_database(),'CREATE')) schema_bootstrap, has_schema_privilege(current_user,'auth','USAGE') auth_usage, has_table_privilege(current_user,'auth.users','SELECT') AND has_table_privilege(current_user,'auth.users','REFERENCES') auth_users, has_table_privilege(current_user,'auth.sessions','SELECT') auth_sessions FROM pg_roles r WHERE r.rolname=current_user");
  if (!Object.values(access).every(Boolean)) throw new Error('The bootstrap administrator needs CREATEROLE and existing Auth read/reference privileges.');
  const existing = (await client.query("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname IN('pactum_app','pactum_jobs','pactum_migrator','pactum_runtime','pactum_worker','pactum_policy_reader') ORDER BY rolname")).rows;
  console.log(JSON.stringify({ target: { host: identity.host, database: identity.database }, mode: apply ? 'provision' : 'read-only', bootstrapReady: true, roles: existing }));
  if (apply) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, 'credentials.json');
    if (fs.existsSync(file) && (fs.statSync(file).mode & 0o077)) throw new Error('Credential file must be readable only by its owner.');
    const credentials = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { identity, passwords: Object.fromEntries(['pactum_app','pactum_jobs','pactum_migrator'].map(role => [role, crypto.randomBytes(32).toString('hex')])) };
    if (JSON.stringify(credentials.identity) !== JSON.stringify(identity) || Object.values(credentials.passwords).some(password => !/^[a-f0-9]{64}$/.test(password))) throw new Error('Credential file does not match this target.');
    const logins = new Set(existing.map(role => role.rolname));
    if (!fs.existsSync(file) && [...logins].some(role => ['pactum_app','pactum_jobs','pactum_migrator'].includes(role))) throw new Error('Existing login credentials require operator review; automatic password rotation is disabled.');
    await client.query('BEGIN'); transaction = true;
    await client.query(fs.readFileSync(fileURLToPath(new URL('./bootstrap.sql', import.meta.url)), 'utf8'));
    for (const [role, password] of Object.entries(credentials.passwords)) {
      if (!['pactum_app','pactum_jobs','pactum_migrator'].includes(role)) throw new Error('Unexpected credential role.');
      await client.query(`ALTER ROLE "${role}" PASSWORD '${password}'`);
    }
    fs.writeFileSync(file, JSON.stringify(credentials), { mode: 0o600 });
    await client.query('COMMIT'); transaction = false;
    const project = decode(target.username).split('.').slice(1).join('.');
    const makeUrl = (role, transactionPool = false) => {
      const url = new URL(source);
      url.username = local ? role : `${role}.${project}`;
      url.password = credentials.passwords[role];
      url.port = transactionPool ? '6543' : (target.port || '5432');
      url.searchParams.set('schema', 'pactum');
      if (transactionPool) url.searchParams.set('pgbouncer', 'true');
      if (!local) {
        url.searchParams.set('sslmode', 'require');
        url.searchParams.set('sslaccept', 'strict');
        url.searchParams.set('sslcert', process.env.DATABASE_CA_FILE);
      }
      return url.href;
    };
    fs.writeFileSync(path.join(directory, 'runtime.env'), `DATABASE_URL=${makeUrl('pactum_app',!local)}\nWORKER_DATABASE_URL=${makeUrl('pactum_jobs',!local)}\n`, { mode: 0o600 });
    fs.writeFileSync(path.join(directory, 'migration.env'), `DATABASE_URL=${makeUrl('pactum_migrator')}\nDIRECT_URL=${makeUrl('pactum_migrator')}\n`, { mode: 0o600 });
    console.log(`Restricted credentials saved privately to ${directory}. Import them through the deployment secret manager.`);
  }
} catch (error) {
  if (transaction) await client.query('ROLLBACK').catch(() => {});
  console.error('Database role provisioning stopped.', error.code || error.name);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
