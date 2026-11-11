// Creates an isolated local cluster. Never reads .env or uses an existing database URL.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Client } from 'pg';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pactum-disposable-'));
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const password=crypto.randomBytes(24).toString('hex');
const cluster=new EmbeddedPostgres({databaseDir:path.join(directory,'data'),user:'pactum_test_migrator',password,port,persistent:false,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-k',directory],onLog:()=>{},onError:()=>{}});
let connection;
try {
 await cluster.initialise();await cluster.start();await cluster.createDatabase('pactum_disposable');
 connection=cluster.getPgClient('pactum_disposable','127.0.0.1');await connection.connect();
 await connection.query('CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz);CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz)');
 await connection.query(fs.readFileSync('scripts/database/bootstrap.sql','utf8'));
 const migrationPassword=crypto.randomBytes(24).toString('hex');
 await connection.query(`ALTER ROLE pactum_migrator PASSWORD '${migrationPassword}'`);
 const migrator=new Client({host:'127.0.0.1',port,database:'pactum_disposable',user:'pactum_migrator',password:migrationPassword});await migrator.connect();
 try {
 for(const migration of fs.readdirSync('prisma/migrations').filter(name=>/^\d/.test(name)).sort()) {
  await migrator.query('BEGIN');try {await migrator.query(fs.readFileSync(`prisma/migrations/${migration}/migration.sql`,'utf8'));await migrator.query('COMMIT');}catch(error){await migrator.query('ROLLBACK');throw error;}
 }
 } finally {await migrator.end();}
 const runtimePassword=crypto.randomBytes(24).toString('hex'),workerPassword=crypto.randomBytes(24).toString('hex');
 await connection.query(`CREATE ROLE pactum_test_runtime LOGIN PASSWORD '${runtimePassword}' IN ROLE pactum_runtime;CREATE ROLE pactum_test_worker LOGIN PASSWORD '${workerPassword}' IN ROLE pactum_worker;GRANT CONNECT ON DATABASE pactum_disposable TO pactum_runtime,pactum_worker`);
 const makeUrl=(user,pass,db='pactum_disposable')=>`postgresql://${user}:${pass}@127.0.0.1:${port}/${db}`;
 // Separate disposable identity-projection database; never seed the persistent developer database.
 await cluster.createDatabase('pactum_local');
 const projection=cluster.getPgClient('pactum_local','127.0.0.1');await projection.connect();
 const identityPassword=crypto.randomBytes(24).toString('hex');
 await projection.query(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz);CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz,revoked_at timestamptz);CREATE ROLE pactum_local_identity LOGIN PASSWORD '${identityPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;REVOKE ALL ON SCHEMA auth FROM PUBLIC;REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM PUBLIC;GRANT USAGE ON SCHEMA auth TO pactum_local_identity;GRANT SELECT,INSERT ON auth.users,auth.sessions TO pactum_local_identity;GRANT UPDATE(email) ON auth.users TO pactum_local_identity;GRANT UPDATE(not_after,revoked_at) ON auth.sessions TO pactum_local_identity`);
 await projection.end();
 const env={...process.env,PACTUM_LIVE_TESTS:'0',PACTUM_DATABASE_TESTS:'1',DATABASE_URL:makeUrl('pactum_test_runtime',runtimePassword),WORKER_DATABASE_URL:makeUrl('pactum_test_worker',workerPassword),PACTUM_TEST_ADMIN_URL:makeUrl('pactum_test_migrator',password),PACTUM_TEST_PROJECTION_URL:makeUrl('pactum_local_identity',identityPassword,'pactum_local'),PACTUM_TEST_PROJECTION_ADMIN_URL:makeUrl('pactum_test_migrator',password,'pactum_local'),APP_ORIGIN:'https://pactum.example',SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_offline_test_configuration',PAYPAL_MERCHANT_ID:'TEST-MERCHANT',PAYPAL_CLIENT_ID:'offline-test-client',PAYPAL_CLIENT_SECRET:'offline-test-secret'};
 const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','vitest.database.config.ts'],{env,stdio:'inherit'});
 const code=await new Promise(resolve=>child.once('exit',resolve));process.exitCode=code??1;
} catch(error) { console.error('Disposable database verification failed:',error instanceof Error?error.message:'unknown error');process.exitCode=1; }
finally {if(connection)await connection.end();await cluster.stop();}
