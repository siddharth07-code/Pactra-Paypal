/* eslint-disable @typescript-eslint/no-require-imports -- Standalone recovery tools use CommonJS outside repository module resolution. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Client } = require(path.join(process.cwd(), 'node_modules/pg'));

const bin = '/opt/homebrew/opt/libpq/bin';
const project = 'telhivuqsrsaesjkkxuh';
const stamp = new Date().toISOString().replaceAll(':', '-');
const directory = path.join(os.homedir(), '.local/share/pactra/backups', project, stamp);
const keyDirectory = path.join(os.homedir(), '.config/pactra-backup/keys');
const keyPath = path.join(keyDirectory, stamp + '.key');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
function decode(value) { try { return decodeURIComponent(value); } catch { return value; } }
function run(program, args, env, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [], errors = [];
    child.stdout.on('data', part => output.push(part));
    child.stderr.on('data', part => errors.push(part));
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        const error = new Error(path.basename(program) + ' failed');
        error.code = 'CHILD_' + code;
        // Keep diagnostic text in the encrypted recovery bundle, never terminal output.
        error.diagnostic = Buffer.concat(errors);
        reject(error);
      } else resolve({ output: Buffer.concat(output), diagnostic: Buffer.concat(errors) });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
function encrypt(buffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('PACTRA01'));
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([Buffer.from('PACTRA01'), iv, cipher.getAuthTag(), ciphertext]);
}
function decrypt(buffer, key) {
  if (buffer.subarray(0, 8).toString() !== 'PACTRA01') throw new Error('Invalid archive header');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(8, 20));
  decipher.setAAD(buffer.subarray(0, 8));
  decipher.setAuthTag(buffer.subarray(20, 36));
  return Buffer.concat([decipher.update(buffer.subarray(36)), decipher.final()]);
}

(async () => {
  process.umask(0o077);
  const {administratorConnection}=await import(path.join(process.cwd(),'scripts/database/connection.mjs'));
  const target=administratorConnection();
  const url = target.url;
  if (!url.username.endsWith('.' + project) || url.port !== '5432' || !url.hostname.endsWith('.pooler.supabase.com')) throw new Error('Unexpected target');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(keyDirectory, { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600, flag: 'wx' });
  const ca = fs.readFileSync(process.env.DATABASE_CA_FILE,'utf8');
  const caPath = path.join(directory, 'supabase-ca.crt');
  fs.writeFileSync(caPath, ca, { mode: 0o600 });
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port, PGDATABASE: url.pathname.slice(1), PGUSER: decode(url.username), PGPASSWORD: decode(url.password), PGSSLMODE: 'verify-full', PGSSLROOTCERT: caPath, PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=120000' };
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;
  const client = new Client({ host: env.PGHOST, port: +env.PGPORT, database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 15000, query_timeout: 120000 });
  const manifest = { project, createdAt: new Date().toISOString(), keyPath, database: env.PGDATABASE, files: {}, tableCounts: [], recoveryVerified: false };
  function save(name, data) {
    const encrypted = encrypt(data, key);
    fs.writeFileSync(path.join(directory, name + '.enc'), encrypted, { mode: 0o600, flag: 'wx' });
    const recovered = decrypt(fs.readFileSync(path.join(directory, name + '.enc')), fs.readFileSync(keyPath));
    if (!recovered.equals(data)) throw new Error('Encrypted round-trip failed');
    manifest.files[name] = { bytes: data.length, sha256: hash(data), encryptedSha256: hash(encrypted) };
  }
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    manifest.serverVersion=(await client.query("SELECT current_setting('server_version') version")).rows[0].version;
    manifest.snapshot = (await client.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
    manifest.extensions = (await client.query('SELECT e.extname,e.extversion,n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1')).rows;
    const tables = (await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2")).rows;
    for (const table of tables) {
      const state = (await client.query("SELECT count(*)::text count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') digest FROM " + quote(table.schemaname) + '.' + quote(table.tablename) + ' t')).rows[0];
      manifest.tableCounts.push({ ...table, ...state });
    }
    console.log('Consistent read-only snapshot established', { tables: tables.length, nonemptyTables: manifest.tableCounts.filter(t => t.count !== '0').length });
    const databaseConfiguration={database:(await client.query("SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee_name,a.privilege_type,a.is_grantable FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database()")).rows,settings:(await client.query("SELECT s.*,CASE WHEN s.setrole=0 THEN NULL ELSE pg_get_userbyid(s.setrole) END role_name,d.datname database_name FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase")).rows};
    save('database-configuration.json',Buffer.from(JSON.stringify(databaseConfiguration)));
    const dump = await run(bin + '/pg_dump', ['--format=custom', '--no-password', '--snapshot=' + manifest.snapshot], env);
    save('database.dump', dump.output);
    save('dump-diagnostics.txt', dump.diagnostic);
    const roles = await run(bin + '/pg_dumpall', ['--roles-only', '--no-role-passwords', '--no-password', '--database=' + env.PGDATABASE], env);
    save('roles.sql', roles.output);
    save('role-diagnostics.txt', roles.diagnostic);
    await client.query('ROLLBACK');
    const listing = await run(bin + '/pg_restore', ['--list'], env, dump.output);
    const parsed = await run(bin + '/pg_restore', ['--file=/dev/null'], env, dump.output);
    save('archive-list.txt', listing.output);
    save('archive-parse-diagnostics.txt', parsed.diagnostic);
    manifest.archiveReadVerified = true;
    manifest.archiveEntries = listing.output.toString().split('\n').filter(line => /^\d+;/.test(line)).length;
    save('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify({ project, createdAt: manifest.createdAt, keyPath, files: manifest.files, tableCount: tables.length, nonemptyTableCount: manifest.tableCounts.filter(t => t.count !== '0').length, archiveEntries: manifest.archiveEntries, archiveReadVerified: true, recoveryVerified: false }, null, 2), { mode: 0o600 });
    fs.copyFileSync(path.join(process.cwd(),'scripts/database/recover-backup.cjs'),path.join(directory,'recover.cjs'));
    fs.copyFileSync(path.join(process.cwd(),'scripts/database/rehearse-backup.cjs'),path.join(directory,'rehearse.cjs'));
    for(const helper of ['recover.cjs','rehearse.cjs'])fs.chmodSync(path.join(directory,helper),0o600);
    fs.writeFileSync(path.join(directory,'RESTORE.md'),`# PACTRA encrypted recovery bundle\n\nCreated ${manifest.createdAt} from a consistent read-only snapshot of Supabase project ${project}, hosted PostgreSQL ${manifest.serverVersion}. No hosted changes were executed.\n\nThe key is stored separately at ${keyPath}. Keep independent secure copies of the archive and separately protected key. Database dump, role definitions (without passwords), ACL/settings, row counts/content digests, and archive listing are authenticated AES-256-GCM payloads with SHA-256 manifests. No plaintext database or role dump was written to disk.\n\nIntegrity: node "${directory}/recover.cjs" verify\n\nComplete local restoration/migration/security rehearsal, from the repository root with Docker running: PACTRA_BACKUP_DIRECTORY="${directory}" node "${directory}/rehearse.cjs"\n\nThe rehearsal restores all schemas/roles to an isolated loopback Supabase 17 container on tmpfs, checks every table, provisions restricted roles, deploys five migrations, verifies security and runs tests. It never connects to hosted PostgreSQL. It removes the container after testing. Its recovery-summary.json is stored under this bundle's rehearsals/ directory.\n\nRestore the ensure_rls event trigger separately under its original postgres owner; the included helper handles its TOC split and original ownership. Roles have no password hashes and passwords must be reprovisioned separately. Never replay a full superuser dump blindly into an active hosted project. Stop writes and payment workers, preserve current state and reconcile provider outcomes before restoring. Use Supabase managed restore/PITR for hosted recovery. A snapshot cannot recover later writes.\n\nEmergency plaintext extraction is restricted to a new mode-0700 path under /private/tmp: node "${directory}/recover.cjs" extract /private/tmp/pactra-recovery-unique. Files use mode 0600. Remove plaintext immediately after a reviewed recovery. Never commit data or keys.\n`,{mode:0o600});
    console.log('Encrypted backup created', { directory, keyPath, archiveEntries: manifest.archiveEntries, archiveReadVerified: true, recoveryVerified: false });
    fs.writeFileSync('/private/tmp/pactra-backup-location.json', JSON.stringify({ directory, keyPath }), { mode: 0o600 });
  } catch (error) {
    if (error.diagnostic) save('failure-diagnostics.txt', error.diagnostic);
    console.log('Backup incomplete', { directory, code: error.code || error.name, encryptedDiagnostics: !!error.diagnostic });
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
    key.fill(0);
  }
})().catch(error => { console.log('Backup setup failed', { code: error.code || error.name }); process.exitCode = 1; });
