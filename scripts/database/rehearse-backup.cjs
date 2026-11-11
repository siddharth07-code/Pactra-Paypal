/* eslint-disable @typescript-eslint/no-require-imports -- Standalone recovery tools use CommonJS outside repository module resolution. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Client } = require(path.join(process.cwd(),'node_modules/pg'));
const backupRoot=process.env.PACTRA_BACKUP_DIRECTORY || __dirname;
const rehearsal={root:path.join(backupRoot,'rehearsals')};
const variant = 'patched-corrected';
if (!/^(old-corrected|patched-original|patched-corrected)$/.test(variant)) throw new Error('Invalid rehearsal variant');
const outputDirectory = path.join(rehearsal.root, 'final-' + new Date().toISOString().replaceAll(':', '-') , variant);
fs.mkdirSync(outputDirectory, { mode: 0o700, recursive: true });
const location = process.env.PACTRA_BACKUP_DIRECTORY
  ? { directory: process.env.PACTRA_BACKUP_DIRECTORY, keyPath: JSON.parse(fs.readFileSync(path.join(process.env.PACTRA_BACKUP_DIRECTORY, 'summary.json'), 'utf8')).keyPath }
  : {directory:__dirname,keyPath:JSON.parse(fs.readFileSync(path.join(__dirname,'summary.json'),'utf8')).keyPath};
const key = fs.readFileSync(location.keyPath);
function decrypt(name) {
  const data = fs.readFileSync(path.join(location.directory, name + '.enc'));
  if (data.subarray(0, 8).toString() !== 'PACTRA01') throw new Error('Invalid archive header');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(8, 20));
  cipher.setAAD(data.subarray(0, 8));
  cipher.setAuthTag(data.subarray(20, 36));
  return Buffer.concat([cipher.update(data.subarray(36)), cipher.final()]);
}
function seal(name, data) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('PACTRA01'));
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  fs.writeFileSync(path.join(outputDirectory, name + '.enc'), Buffer.concat([Buffer.from('PACTRA01'), iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
}
function run(args, input, extraEnv = {}, program = 'docker') {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { env: { ...process.env, ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [], errors = [];
    child.stdout.on('data', part => output.push(part));
    child.stderr.on('data', part => errors.push(part));
    child.on('error', reject);
    child.on('close', code => resolve({ code, output: Buffer.concat(output), errors: Buffer.concat(errors) }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
const container = 'pactra-recovery-' + crypto.randomBytes(5).toString('hex');
const network = container + '-internal';
const localPassword = crypto.randomBytes(32).toString('hex');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
async function sql(statement, database = 'postgres', user = 'supabase_admin') {
  const result = await run(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-U', user, '-d', database], statement);
  if (result.code !== 0) throw Object.assign(new Error('Local SQL failed'), { diagnostic: result.errors, step: 'sql' });
  return result.output.toString().trim();
}
(async () => {
  process.umask(0o077);
  const manifest = JSON.parse(decrypt('manifest.json'));
  for (const [name, expected] of Object.entries(manifest.files)) {
    const data = decrypt(name);
    if (crypto.createHash('sha256').update(data).digest('hex') !== expected.sha256) throw new Error('Backup hash mismatch');
  }
  console.log('All encrypted backup payloads authenticated and plaintext SHA-256 checks passed');
  let started = false, networkCreated = false;
  const result = { startedAt: new Date().toISOString(), variant, image: variant === 'old-corrected' ? 'supabase/postgres:17.6.1.136' : 'supabase/postgres:17.6.1.152', network: 'bridge', publishedInterface: '127.0.0.1', storage: 'tmpfs', fullRestorePassed: false, rowCountsMatch: false, migrationsPassed: [] };
  try {
    const start = await run(['run', '-d', '--name', container, '--label', 'pactra.task=current-user-rehearsal', '--network', 'bridge', '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=512m,mode=0700', '--env', 'POSTGRES_PASSWORD', result.image, 'postgres', '-c', 'config_file=/etc/postgresql/postgresql.conf', '-c', 'log_statement=none', '-c', 'log_min_error_statement=fatal'], undefined, { POSTGRES_PASSWORD: localPassword });
    if (start.code !== 0) throw Object.assign(new Error('Recovery container failed'), { diagnostic: start.errors });
    started = true;
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      const probe = await run(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin']);
      if (probe.code === 0) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) {
      const logs = await run(['logs', container]);
      throw Object.assign(new Error('Recovery database did not start'), { diagnostic: logs.errors, step: 'startup' });
    }
    result.server = JSON.parse(await sql("SELECT row_to_json(t) FROM (SELECT current_setting('server_version') server_version,current_setting('session_preload_libraries') session_preload_libraries,current_setting('shared_preload_libraries') shared_preload_libraries) t;"));
    result.imageIdentity = JSON.parse((await run(['image', 'inspect', '--format', '{{json .}}', result.image])).output.toString());
    result.imageIdentity = { id: result.imageIdentity.Id, digests: result.imageIdentity.RepoDigests, architecture: result.imageIdentity.Architecture };
    // Provider roles already exist in the vendor image. Preserve their local passwords.
    const existing = new Set((await sql('SELECT rolname FROM pg_roles;')).split('\n'));
    const roles = decrypt('roles.sql').toString().split('\n').filter(line => {
      const match = /^CREATE ROLE (?:"([^"]+)"|([^;]+));$/.exec(line);
      return !match || !existing.has(match[1] || match[2]);
    }).join('\n');
    await sql(roles);
    await sql('CREATE DATABASE pactum_disposable OWNER postgres TEMPLATE template0;');
    const databaseConfiguration = JSON.parse(decrypt('database-configuration.json'));
    const grants = databaseConfiguration.database.map(grant => {
      const grantee = grant.grantee_name === 'PUBLIC' ? 'PUBLIC' : quote(grant.grantee_name);
      return 'GRANT ' + grant.privilege_type + ' ON DATABASE pactum_disposable TO ' + grantee + (grant.is_grantable ? ' WITH GRANT OPTION' : '') + ';';
    });
    await sql(grants.join('\n'));
    const settingStatements=[];
    for(const setting of databaseConfiguration.settings || []) {
      if(!setting.setdatabase || setting.database_name!=='postgres')continue;
      for(const entry of setting.setconfig || []) {
        const separator=entry.indexOf('=');
        const parameter=entry.slice(0,separator), value=entry.slice(separator+1);
        const prefix=setting.role_name?'ALTER ROLE '+quote(setting.role_name)+' IN DATABASE pactum_disposable':'ALTER DATABASE pactum_disposable';
        settingStatements.push(prefix+' SET '+quote(parameter)+" TO '"+value.replaceAll("'","''")+"';");
      }
    }
    if(settingStatements.length)await sql(settingStatements.join('\n'));
    result.databaseRoleSettingsRestored=settingStatements.length;
    if(settingStatements.length) {
      const applied=JSON.parse(await sql("SELECT coalesce(json_agg(json_build_object('role_name',CASE WHEN s.setrole=0 THEN NULL ELSE pg_get_userbyid(s.setrole) END,'setconfig',s.setconfig)),'[]'::json) FROM pg_db_role_setting s JOIN pg_database d ON d.oid=s.setdatabase WHERE d.datname='pactum_disposable'"));
      for(const setting of databaseConfiguration.settings.filter(s=>s.database_name==='postgres')) {
        if(!applied.some(s=>s.role_name===setting.role_name && JSON.stringify(s.setconfig)===JSON.stringify(setting.setconfig)))throw new Error('Database role settings did not restore exactly');
      }
    }
    // The existing ensure_rls trigger must be created under its original non-superuser owner.
    // Creating it as the restore superuser conflicts with Supabase's ownership check.
    const listing = decrypt('archive-list.txt').toString().split('\n');
    const triggerLine = listing.find(line => /EVENT TRIGGER - ensure_rls postgres$/.test(line));
    if (!triggerLine) throw new Error('Expected trigger archive entry missing');
    const listDirectory = fs.mkdtempSync('/private/tmp/pactra-restore-list-');
    try {
      const mainList = path.join(listDirectory, 'main.list'), triggerList = path.join(listDirectory, 'trigger.list');
      fs.writeFileSync(mainList, listing.filter(line => line !== triggerLine).join('\n'), { mode: 0o600 });
      fs.writeFileSync(triggerList, triggerLine + '\n', { mode: 0o600 });
      for (const [list, originalOwner] of [[mainList, false], [triggerList, true]]) {
        const args = ['--use-list=' + list, '--file=-'];
        if (originalOwner) args.push('--use-set-session-authorization');
        const generated = await run(args, decrypt('database.dump'), {}, '/opt/homebrew/opt/libpq/bin/pg_restore');
        if (generated.code !== 0) throw Object.assign(new Error('Archive SQL generation failed'), { diagnostic: generated.errors });
        await sql(Buffer.concat([Buffer.from('BEGIN;\n'), generated.output, Buffer.from('\nCOMMIT;\n')]), 'pactum_disposable');
      }
    } finally {
      for (const name of fs.readdirSync(listDirectory)) fs.unlinkSync(path.join(listDirectory, name));
      fs.rmdirSync(listDirectory);
    }
    result.fullRestorePassed = true;
    const countQueries = manifest.tableCounts.map((table, ordinal) => 'SELECT ' + ordinal + ' ordinal,count(*)::text count FROM ' + quote(table.schemaname) + '.' + quote(table.tablename));
    const counts = JSON.parse(await sql('SELECT json_agg(t ORDER BY ordinal) FROM (' + countQueries.join(' UNION ALL ') + ') t;', 'pactum_disposable'));
    if (counts.some((row, index) => row.count !== manifest.tableCounts[index].count)) throw new Error('Restored row count differs');
    result.rowCountsMatch = true;
    console.log('Full local restore passed', { tablesVerified: manifest.tableCounts.length, rowCountsMatch: true });
    if (process.argv.includes('--restore-only')) return;
    const published = await run(['port', container, '5432']);
    const port = Number(published.output.toString().trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1]);
    if (!port) throw new Error('Expected loopback-only PostgreSQL port');
    const connectionUrl = (user,password=localPassword) => 'postgresql://' + user + ':' + password + '@127.0.0.1:' + port + '/pactum_disposable?schema=pactum&sslmode=disable';
    const localUrl = connectionUrl('postgres');
    const client = new Client({ connectionString: localUrl, connectionTimeoutMillis: 10000, query_timeout: 20000 });
    const prismaDirectory = fs.mkdtempSync('/private/tmp/pactra-prisma-rehearsal-');
    try {
      result.stage = 'client-connect';
      await client.connect();
      const snapshot = async () => {
        const rows = [];
        for (const table of manifest.tableCounts) {
          const name = quote(table.schemaname) + '.' + quote(table.tablename);
          rows.push((await client.query("SELECT count(*)::text count, encode(extensions.digest(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'sha256'),'hex') digest FROM " + name + ' t')).rows[0]);
        }
        return rows;
      };
      result.stage = 'pre-migration-content-digests';
      const before = await snapshot();
      const verificationEnv={BOOTSTRAP_DATABASE_URL:localUrl,DEPLOYMENT_BASELINE_FILE:path.join(outputDirectory,'restored-baseline.json'),VERIFIED_BACKUP_BASELINE_FILE:''};
      const verifiedBefore=await run(['scripts/database/verify-deployment.mjs','--before'],undefined,verificationEnv,process.execPath);
      if(verifiedBefore.code!==0)throw new Error('Local restored baseline capture failed');
      const restored=JSON.parse(fs.readFileSync(verificationEnv.DEPLOYMENT_BASELINE_FILE,'utf8'));
      if(manifest.tableCounts.every(t=>t.digest) && JSON.stringify(restored.tables)!==JSON.stringify(manifest.tableCounts.map(t=>({schema:t.schemaname,table:t.tablename,count:t.count,digest:t.digest}))))throw new Error('Restored contents differ from the encrypted snapshot');
      result.backupContentDigestsMatch=manifest.tableCounts.every(t=>t.digest);
      const identity={host:'127.0.0.1',port:String(port),database:'pactum_disposable',bootstrapRole:'postgres'};
      const credentialId=crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0,16);
      const credentialRoot=path.join(outputDirectory,'credentials');
      verificationEnv.PACTRA_CREDENTIAL_ROOT=credentialRoot;
      const credentialDirectory=path.join(credentialRoot,credentialId);
      fs.mkdirSync(credentialDirectory,{recursive:true,mode:0o700});
      const credentialFile=path.join(credentialDirectory,'credentials.json');
      // Backups intentionally omit passwords. A post-bootstrap restore needs fresh LOCAL credentials.
      const loginRoles=['pactum_app','pactum_jobs','pactum_migrator'];
      const restoredLogins=(await client.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1)',[loginRoles])).rows;
      if(restoredLogins.length) {
        if(restoredLogins.length!==loginRoles.length)throw new Error('Incomplete restored role model');
        const passwords=Object.fromEntries(loginRoles.map(role=>[role,crypto.randomBytes(32).toString('hex')]));
        for(const role of loginRoles)await client.query(`ALTER ROLE ${quote(role)} PASSWORD '${passwords[role]}'`);
        fs.writeFileSync(credentialFile,JSON.stringify({identity,passwords}),{mode:0o600,flag:'wx'});
      }
      const provisioningEnv={BOOTSTRAP_DATABASE_URL:localUrl,PACTRA_CREDENTIAL_ROOT:credentialRoot};
      const provisioning = await run(['scripts/database/provision-roles.mjs','--apply'],undefined,provisioningEnv,process.execPath);
      seal('role-provisioning.txt',Buffer.concat([provisioning.output,provisioning.errors]));
      if(provisioning.code!==0)throw new Error('Local least-privilege provisioning failed');
      const credentials=JSON.parse(fs.readFileSync(credentialFile,'utf8'));
      result.provisioning={exit:provisioning.code,privateCredentialMode:(fs.statSync(credentialFile).mode&0o777).toString(8)};
      const repeated=await run(['scripts/database/provision-roles.mjs','--apply'],undefined,provisioningEnv,process.execPath);
      if(repeated.code!==0)throw new Error('Role provisioning retry failed');
      result.provisioning.retryPreservedCredentials=JSON.stringify(credentials)===fs.readFileSync(credentialFile,'utf8');
      fs.cpSync('prisma', path.join(prismaDirectory, 'prisma'), { recursive: true });
      const schema = path.join(prismaDirectory, 'prisma/schema.prisma');
      if (variant === 'patched-original') fs.copyFileSync(path.join(rehearsal.root, 'original-security.sql'), path.join(prismaDirectory, 'prisma/migrations/202611060002_security/migration.sql'));
      const registryDirectory=path.dirname(credentialFile); const parseEnv=require('node:util').parseEnv; const migrationEnv=parseEnv(fs.readFileSync(path.join(registryDirectory,'migration.env'),'utf8')); const runtimeEnv=parseEnv(fs.readFileSync(path.join(registryDirectory,'runtime.env'),'utf8')); if(Object.keys(migrationEnv).length!==2 || !migrationEnv.DIRECT_URL || migrationEnv.DATABASE_URL!==migrationEnv.DIRECT_URL || Object.keys(runtimeEnv).length!==2 || !runtimeEnv.WORKER_DATABASE_URL) throw new Error('Generated environment files are malformed'); result.provisioning.generatedEnvironmentParsed=true; for(const f of ['runtime.env','migration.env']) if((fs.statSync(path.join(registryDirectory,f)).mode&0o777)!==0o600)throw new Error('Generated environment file permissions failed'); const env={...migrationEnv,CHECKPOINT_DISABLE:'1', PRISMA_HIDE_UPDATE_MESSAGE:'1'};
      const cli = async (label, args) => {
        const child = await run(['node_modules/prisma/build/index.js', ...args], undefined, env, process.execPath);
        seal(label + '.txt', Buffer.concat([child.output, child.errors]));
        result[label] = { exit: child.code, codes: [...new Set((child.output + '\n' + child.errors).match(/\bP\d{4}\b/g))] };
        return child;
      };
      result.stage = 'prisma-deploy';
      const deployed = await cli('prisma-deploy', ['migrate', 'deploy', '--schema', schema]);
      if (deployed.code !== 0) throw new Error('Local Prisma deploy failed');
      const verifiedAfter=await run(['scripts/database/verify-deployment.mjs','--after'],undefined,verificationEnv,process.execPath);
      seal('operator-verification.txt',Buffer.concat([verifiedAfter.output,verifiedAfter.errors]));
      if(verifiedAfter.code!==0)throw new Error('Operator post-deployment verification failed locally');
      result.operatorVerification=JSON.parse(verifiedAfter.output.toString());
      const status = await cli('prisma-status', ['migrate', 'status', '--schema', schema]);
      result.statusUpToDate = status.output.toString().includes('Database schema is up to date');
      if (status.code !== 0 || !result.statusUpToDate) throw new Error('Local Prisma migration status failed');
      const historySchemas = (await client.query("SELECT schemaname FROM pg_tables WHERE tablename='_prisma_migrations'")).rows;
      for (const { schemaname } of historySchemas) {
        const history = (await client.query('SELECT migration_name,finished_at IS NOT NULL finished,rolled_back_at IS NOT NULL rolled_back FROM ' + quote(schemaname) + '._prisma_migrations ORDER BY started_at')).rows;
        result.migrationsPassed.push(...history.filter(row => row.finished && !row.rolled_back).map(row => row.migration_name));
      }
      if (result.migrationsPassed.length !== 5) throw new Error('Expected five completed migration history entries');
      const after = await snapshot();
      result.existingContentsUnchanged = JSON.stringify(before) === JSON.stringify(after);
      if (!result.existingContentsUnchanged) throw new Error('Existing restored records changed during migration');
      const query = async statement => (await client.query(statement)).rows;
      result.security = {
        tables: await query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pactum' AND c.relkind='r' AND c.relname<>'_prisma_migrations' ORDER BY 1"),
        roles: await query("SELECT rolname,rolcanlogin,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,has_schema_privilege(rolname,'auth','USAGE') auth_usage FROM pg_roles WHERE rolname IN('pactum_runtime','pactum_worker','pactum_policy_reader','pactum_app','pactum_jobs','pactum_migrator') ORDER BY 1"),
        membership: await query("SELECT r.rolname role,u.rolname member,g.rolname grantor,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member JOIN pg_roles g ON g.oid=m.grantor WHERE r.rolname='pactum_policy_reader' ORDER BY 2,3"),
        effectiveMembership: await query("SELECT pg_has_role('postgres','pactum_policy_reader','USAGE') migration_inherits,pg_has_role('postgres','pactum_policy_reader','SET') migration_can_set,pg_has_role('pactum_runtime','pactum_policy_reader','MEMBER') runtime_privileged,pg_has_role('pactum_worker','pactum_policy_reader','MEMBER') worker_privileged"),
        policies: await query("SELECT tablename,policyname,roles,cmd FROM pg_policies WHERE schemaname='pactum' ORDER BY 1,2"),
        functions: await query("SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.proconfig,EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pactum' AND p.prosecdef ORDER BY 1"),
        indexes: await query("SELECT count(*)::int total,count(*) FILTER (WHERE i.indisvalid AND i.indisready)::int valid FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pactum' AND c.relname<>'_prisma_migrations'"),
        constraints: await query("SELECT count(*)::int total,count(*) FILTER (WHERE convalidated)::int validated FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='pactum'"),
        restrictedSchema: await query("SELECT has_schema_privilege('pactum_runtime','pactum','CREATE') runtime_create,has_schema_privilege('pactum_worker','pactum','CREATE') worker_create,has_schema_privilege('pactum_policy_reader','pactum','CREATE') reader_create")
      };
      const security = result.security;
      if (security.tables.length !== 16 || security.tables.some(t => !t.relrowsecurity || !t.relforcerowsecurity)) throw new Error('RLS verification failed');
      if (security.functions.some(f => f.owner !== (['verified_auth_session','verified_auth_email','install_auth_identity_fk'].includes(f.proname)?'postgres':'pactum_policy_reader') || f.public_execute || !f.proconfig?.includes('search_path=pg_catalog'))) throw new Error('Policy helper security failed');
      if(security.roles.some(r=>r.rolsuper||r.rolbypassrls||r.rolcreaterole||r.rolcreatedb||r.auth_usage))throw new Error('Unexpected elevated or direct Auth privileges on PACTRA role');
      const effective = security.effectiveMembership[0];
      if (!effective.migration_inherits || !effective.migration_can_set || effective.runtime_privileged || effective.worker_privileged) throw new Error('Role membership security failed');
      if (Object.values(security.restrictedSchema[0]).some(Boolean)) throw new Error('Unexpected schema creation privilege');
      if (security.indexes[0].valid !== security.indexes[0].total || security.constraints[0].validated !== security.constraints[0].total) throw new Error('Invalid database objects');
      const diff = await cli('prisma-diff', ['migrate', 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--exit-code']);
      result.schemaDiff = diff.output.toString().replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (diff.code === 1 && (diff.output + diff.errors).includes('P4002') && (diff.output + diff.errors).includes('auth_identity_fk')) result.prismaDiffLimitation = 'P4002: existing SQL-managed auth_identity_fk references auth.users outside the Prisma datasource schemas list.';
      const validated = await cli('prisma-validate', ['validate', '--schema', schema]);
      if (validated.code !== 0) throw new Error('Prisma schema validation failed');
      console.log('Local Prisma deployment and security verified', { variant, migrations: result.migrationsPassed.length, forcedRlsTables: security.tables.length, policies: security.policies.length, indexes: security.indexes[0], existingContentsUnchanged: true, schemaDiffExit: diff.code });
      if (variant === 'patched-corrected') {
        result.authBootstrap = (await query("SELECT has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION') bootstrap_can_delegate,has_schema_privilege('pactum_policy_reader','auth','USAGE') reader_direct_access"))[0];
        const generated = await cli('prisma-expected-ddl', ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', schema, '--script']);
        if (generated.code !== 0) throw new Error('Prisma expected schema SQL generation failed');
        await client.query('CREATE DATABASE pactra_schema_expected');
        const expectedUrl = new URL(localUrl); expectedUrl.pathname = '/pactra_schema_expected';
        const expected = new Client({ connectionString: expectedUrl.href, connectionTimeoutMillis: 10000 });
        try {
          await expected.connect();
          await expected.query('CREATE SCHEMA pactum; SET search_path=pactum,pg_catalog');
          await expected.query(generated.output.toString());
          await expected.query('RESET search_path');
          const catalogQueries = {
            columns: "SELECT c.relname table_name,a.attname column_name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,pg_get_expr(d.adbin,d.adrelid) default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='pactum' AND c.relkind='r' AND c.relname<>'_prisma_migrations' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2",
            indexes: "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='pactum' AND tablename<>'_prisma_migrations' ORDER BY 1,2",
            constraints: "SELECT t.relname table_name,c.conname, c.contype,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='pactum' AND t.relname<>'_prisma_migrations' ORDER BY 1,2",
            enums: "SELECT t.typname,array_agg(e.enumlabel ORDER BY e.enumsortorder) labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='pactum' GROUP BY t.typname ORDER BY 1"
          };
          result.catalogConsistency = {};
          for (const [label, statement] of Object.entries(catalogQueries)) {
            const actualRows = (await client.query(statement)).rows, expectedRows = (await expected.query(statement)).rows;
            const actualSet = new Set(actualRows.map(row => JSON.stringify(row)));
            const missing = expectedRows.filter(row => !actualSet.has(JSON.stringify(row)));
            result.catalogConsistency[label] = { expected: expectedRows.length, actual: actualRows.length, missing: missing.length };
            if (missing.length) { seal('catalog-differences-' + label + '.json', Buffer.from(JSON.stringify(missing))); throw new Error('Prisma model catalog mismatch in ' + label); }
            if (['columns', 'enums'].includes(label) && actualRows.length !== expectedRows.length) throw new Error('Unexpected model catalog objects in ' + label);
          }
        } finally { await expected.end(); }
        await sql('CREATE ROLE "PACTRA ""quoted"" migration" NOLOGIN CREATEROLE NOBYPASSRLS; SET SESSION AUTHORIZATION "PACTRA ""quoted"" migration"; CREATE ROLE pactra_quoted_grant_probe NOLOGIN NOBYPASSRLS; DO $$ BEGIN EXECUTE format(\'GRANT pactra_quoted_grant_probe TO %I\',current_user); END $$; RESET SESSION AUTHORIZATION;');
        result.quotedIdentityGrant = (await query("SELECT pg_has_role('PACTRA \"quoted\" migration','pactra_quoted_grant_probe','USAGE') granted"))[0].granted;
        if (!result.quotedIdentityGrant) throw new Error('Quoted role identity regression failed');
        result.security.testLogins = await query("SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,has_schema_privilege(rolname,'pactum','CREATE') schema_create FROM pg_roles WHERE rolname IN('pactum_app','pactum_jobs','pactum_migrator') ORDER BY 1");
        const testEnv = { ...env, PACTUM_LIVE_TESTS: '0', PACTUM_DATABASE_TESTS: '1', DATABASE_URL:runtimeEnv.DATABASE_URL, WORKER_DATABASE_URL:runtimeEnv.WORKER_DATABASE_URL, PACTUM_TEST_ADMIN_URL: localUrl, APP_ORIGIN: 'https://pactum.example', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_offline_test_configuration', PAYPAL_MERCHANT_ID: 'TEST-MERCHANT', PAYPAL_CLIENT_ID: 'offline-test-client', PAYPAL_CLIENT_SECRET: 'offline-test-secret' };
        const tested = await run(['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.database.config.ts', 'src/test/postgres-security.database.test.ts'], undefined, testEnv, process.execPath);
        seal('supabase-security-tests.txt', Buffer.concat([tested.output, tested.errors]));
        const text = tested.output.toString().replace(/\x1b\[[0-9;]*m/g, '');
        result.supabaseSecurityTests = { exit: tested.code, passed: Number(text.match(/Tests\s+(\d+) passed/)?.[1] || 0), failed: Number(text.match(/Tests\s+(\d+) failed/)?.[1] || 0) };
        console.log('Restricted-role tests on restored Supabase', result.supabaseSecurityTests);
        if (tested.code !== 0) throw new Error('Restored Supabase security tests failed');
      }
    } finally {
      await client.end().catch(() => {});
      fs.rmSync(prismaDirectory, { recursive: true });
    }
    result.tableCountsStillMatchBeforeTests = result.existingContentsUnchanged;
    console.log('Existing restored records preserved by migrations', result.tableCountsStillMatchBeforeTests);
    const logs = await run(['logs', container]);
    const diagnostic = Buffer.concat([logs.output, logs.errors]);
    seal('local-server-diagnostics.txt', diagnostic);
    result.serverSignals = [...new Set(diagnostic.toString().match(/was terminated by signal (?:6|11)[^\n]*/g) || [])];
    if (result.serverSignals.length) throw new Error('Unexpected server crash in successful rehearsal');
  } catch (error) {
    if (started) {
      const logs = await run(['logs', container]);
      const diagnostic = Buffer.concat([logs.output, logs.errors]);
      seal('local-server-diagnostics.txt', diagnostic);
      const text = diagnostic.toString();
      result.serverSignals = [...new Set(text.match(/was terminated by signal (?:6|11)[^\n]*/g) || [])];
      result.outOfMemory = /out of memory|oom-kill|Cannot allocate memory/i.test(text);
      result.noSpace = /No space left on device/i.test(text);
      const inspect = await run(['inspect', '--format', '{{.State.OOMKilled}} {{.State.ExitCode}}', container]);
      result.containerState = inspect.output.toString().trim();
    }
    if (error.diagnostic) {
      seal('recovery-failure.txt', error.diagnostic);
      const text = error.diagnostic.toString();
      result.missingExtension = text.match(/extension "([\w-]+)" is not available/)?.[1];
      result.missingRole = text.match(/role "([\w-]+)" does not exist/)?.[1];
      result.missingSchema = text.match(/schema "([\w-]+)" does not exist/)?.[1];
      result.permissionDenied = /permission denied|must be (?:superuser|owner)/i.test(text);
      result.unsupportedArchiveVersion = /unsupported version .* in file header/.test(text);
    }
    result.failure = error.message;
    result.errorCode = error.code;
    result.errorStackFrames = error.stack?.split('\n').slice(1, 5);
    result.step = error.step;
    process.exitCode = 1;
  } finally {
    if (started) {
      const removed = await run(['rm', '-f', '-v', container]);
      result.localContainerRemoved = removed.code === 0;
    }
    if (networkCreated) result.localNetworkRemoved = (await run(['network', 'rm', network])).code === 0;
    result.finishedAt = new Date().toISOString();
    seal('recovery-verification.json', Buffer.from(JSON.stringify(result, null, 2)));
    fs.writeFileSync(path.join(outputDirectory, 'recovery-summary.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log('Recovery verification', { variant, fullRestorePassed: result.fullRestorePassed, rowCountsMatch: result.rowCountsMatch, migrationsPassed: result.migrationsPassed, failure: result.failure, serverSignals: result.serverSignals, localContainerRemoved: result.localContainerRemoved, localNetworkRemoved: result.localNetworkRemoved, directory: outputDirectory });
    key.fill(0);
  }
})().catch(error => { console.log('Recovery verification setup failed', error.code || error.name); process.exitCode = 1; });
