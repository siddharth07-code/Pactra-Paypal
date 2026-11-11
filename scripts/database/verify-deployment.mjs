import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseEnv } from 'node:util';
import { Client } from 'pg';
import { administratorConnection, DeploymentError } from './connection.mjs';

const connections = [];
const ensure = (condition, message) => { if (!condition) throw new DeploymentError(message); };
const quote = value => '"' + value.replaceAll('"', '""') + '"';
async function connect(config) {
  const client = new Client(config); connections.push(client); await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  return client;
}
try {
  ensure(process.argv.length === 3 && ['--before', '--after'].includes(process.argv[2]), 'Use --before or --after with DEPLOYMENT_BASELINE_FILE.');
  const before = process.argv[2] === '--before';
  const baselineFile = process.env.DEPLOYMENT_BASELINE_FILE;
  ensure(baselineFile && path.isAbsolute(baselineFile), 'Set DEPLOYMENT_BASELINE_FILE to a private absolute path outside Git.');
  const relative = path.relative(process.cwd(), baselineFile);
  ensure(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'The deployment baseline must be stored outside the repository.');
  const target = administratorConnection();
  const admin = await connect(target.config);
  const snapshot = [];
  const tables = (await admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN('pactum','information_schema') AND schemaname !~ '^pg_' ORDER BY 1,2")).rows;
  for (const { schemaname, tablename } of tables) {
    const state = (await admin.query(`SELECT count(*)::text count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') digest FROM ${quote(schemaname)}.${quote(tablename)} t`)).rows[0];
    snapshot.push({ schema: schemaname, table: tablename, ...state });
  }
  if (before) {
    if (process.env.VERIFIED_BACKUP_BASELINE_FILE) {
      const restored = JSON.parse(fs.readFileSync(process.env.VERIFIED_BACKUP_BASELINE_FILE,'utf8'));
      ensure(JSON.stringify(restored.tables) === JSON.stringify(snapshot), 'The verified backup differs from current records. Take and verify a fresh recoverable backup before cutover.');
    }
    const existing = await admin.query("SELECT count(*)::int count FROM pg_tables WHERE schemaname='pactum'");
    ensure(existing.rows[0].count === 0, 'Application tables already exist. Review the existing installation instead of treating it as this initial cutover.');
    fs.writeFileSync(baselineFile, JSON.stringify({ identity: target.identity, recordedAt: new Date().toISOString(), tables: snapshot }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ baselineSaved: true, existingTables: snapshot.length, readOnly: true }));
  } else {
    const stat = fs.lstatSync(baselineFile);
    ensure(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077), 'Baseline must be an owner-only regular file.');
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    ensure(JSON.stringify(baseline.identity) === JSON.stringify(target.identity), 'Baseline target differs from this connection.');
    ensure(JSON.stringify(baseline.tables) === JSON.stringify(snapshot), 'Existing record counts or contents changed. Stop traffic and reconcile differences; do not restore automatically.');
    const migrations = (await admin.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM pactum._prisma_migrations ORDER BY migration_name')).rows;
    const names = fs.readdirSync('prisma/migrations').filter(name => /^\d/.test(name)).sort();
    ensure(migrations.length === 5 && names.length === 5 && names.every((name, i) => migrations[i].migration_name === name && migrations[i].finished_at && !migrations[i].rolled_back_at && migrations[i].checksum === crypto.createHash('sha256').update(fs.readFileSync(`prisma/migrations/${name}/migration.sql`)).digest('hex')), 'Migration history/checksums differ from the five reviewed migrations.');
    const roles = (await admin.query("SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,has_schema_privilege(oid,'auth','USAGE') auth_access,has_schema_privilege(oid,'pactum','CREATE') schema_create,has_database_privilege(oid,current_database(),'CREATE') database_create FROM pg_roles WHERE rolname=ANY($1) ORDER BY 1", [['pactum_app','pactum_jobs','pactum_migrator','pactum_runtime','pactum_worker','pactum_policy_reader']])).rows;
    ensure(roles.length === 6 && roles.every(r => !r.rolsuper && !r.rolcreatedb && !r.rolcreaterole && !r.rolbypassrls && r.rolinherit && !r.auth_access && !r.database_create && r.schema_create === (r.rolname === 'pactum_migrator') && r.rolcanlogin === ['pactum_app','pactum_jobs','pactum_migrator'].includes(r.rolname)), 'Unexpected PACTRA role attributes or privileges.');
    const outsideCreate = await admin.query("SELECT 1 FROM pg_roles r CROSS JOIN pg_namespace n WHERE r.rolname=ANY($1) AND n.nspname<>'pactum' AND n.nspname !~ '^pg_' AND has_schema_privilege(r.oid,n.oid,'CREATE')",[roles.map(role => role.rolname)]);
    ensure(outsideCreate.rowCount === 0, 'A PACTRA role can create objects outside its application schema.');
    const memberships = (await admin.query("SELECT member.rolname member,parent.rolname parent,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid WHERE member.rolname=ANY($1)", [roles.map(r => r.rolname)])).rows;
    const expected = { pactum_app:'pactum_runtime',pactum_jobs:'pactum_worker',pactum_migrator:'pactum_policy_reader' };
    ensure(memberships.length === 3 && memberships.every(m => expected[m.member] === m.parent && !m.admin_option && m.inherit_option && m.set_option), 'Unexpected role memberships.');
    const tables = (await admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pactum' AND c.relkind='r' AND c.relname<>'_prisma_migrations'")).rows;
    ensure(tables.length === 16 && tables.every(t => t.relrowsecurity && t.relforcerowsecurity), 'Expected 16 forced-RLS application tables.');
    const policies = Number((await admin.query("SELECT count(*) FROM pg_policies WHERE schemaname='pactum'")).rows[0].count);
    ensure(policies === 62, 'Expected 62 reviewed RLS policies.');
    const functions = (await admin.query("SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.proconfig,EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pactum' AND p.prosecdef")).rows;
    ensure(functions.length >= 3 && functions.every(f => f.owner === (['verified_auth_session','verified_auth_email','install_auth_identity_fk'].includes(f.proname) ? target.config.user.split('.')[0] : 'pactum_policy_reader') && f.proconfig?.includes('search_path=pg_catalog') && !f.public_execute), 'Unsafe Auth/policy helper ownership, search path, or PUBLIC execution.');
    const indexes = (await admin.query("SELECT count(*)::int total,bool_and(indisvalid AND indisready) valid FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pactum' AND c.relname<>'_prisma_migrations'")).rows[0];
    const constraints = (await admin.query("SELECT count(*)::int total,bool_and(convalidated) valid FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='pactum' AND c.contype<>'n'")).rows[0];
    const constraintNames = new Set((await admin.query("SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='pactum'")).rows.map(row => row.conname));
    const requiredConstraints = ['auth_identity_fk', ...names.flatMap(name => [...fs.readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8').matchAll(/\bCONSTRAINT\s+(?:"([^"]+)"|([a-z_][a-z_0-9]*))/gi)].map(match => match[1] || match[2].toLowerCase()))];
    ensure(indexes.total === 52 && indexes.valid && constraints.valid && requiredConstraints.every(name => constraintNames.has(name)), 'Invalid or missing application indexes/constraints.');
    const digest = crypto.createHash('sha256').update(JSON.stringify(target.identity)).digest('hex').slice(0,16);
    const directory = path.join(process.env.PACTRA_CREDENTIAL_ROOT || path.join(os.homedir(),'.local/share/pactra/database-credentials'),digest);
    const runtime = parseEnv(fs.readFileSync(path.join(directory,'runtime.env'),'utf8'));
    for (const [key,role] of [['DATABASE_URL','pactum_app'],['WORKER_DATABASE_URL','pactum_jobs']]) {
      const url = new URL(runtime[key]);
      ensure(url.hostname === target.identity.host && url.username === (target.local ? role : `${role}.${target.project}`) && url.searchParams.get('schema') === 'pactum' && url.port === (target.local ? target.identity.port : '6543'), 'Generated runtime target or identity differs.');
      const restricted = await connect({ ...target.config, port:Number(url.port),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password) });
      ensure(Number((await restricted.query('SELECT count(*) FROM pactum."ProcurementSession"')).rows[0].count) === 0, 'Unscoped runtime/worker can see tenant sessions.');
      await restricted.query('SAVEPOINT auth_denial');
      let denied = false;
      try { await restricted.query('SELECT id FROM auth.users LIMIT 0'); } catch (error) { denied = error.code === '42501'; }
      await restricted.query('ROLLBACK TO SAVEPOINT auth_denial');
      ensure(denied, 'Restricted login has direct Auth access.');
    }
    console.log(JSON.stringify({ verified:true,readOnly:true,existingTablesPreserved:snapshot.length,migrations:5,restrictedRoles:6,forcedRlsTables:16,policies,indexes:indexes.total,constraints:constraints.total,runtimeAndWorkerLogins:'verified',directAuthAccess:'denied' }));
  }
} catch (error) {
  console.error('Deployment verification stopped.',error instanceof DeploymentError ? error.message : (error.code || error.name));
  process.exitCode=1;
} finally {
  for (const client of connections) { await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{}); }
}
