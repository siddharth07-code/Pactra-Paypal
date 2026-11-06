// Persistent, loopback-only development cluster. Never reads remote database URLs.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
process.umask(0o077);
const root=path.resolve('.pactum-local');fs.mkdirSync(root,{recursive:true,mode:0o700});
const file=path.join(root,'credentials.json');
if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({port:55440,admin:crypto.randomBytes(32).toString('hex'),runtime:crypto.randomBytes(32).toString('hex'),worker:crypto.randomBytes(32).toString('hex'),identity:crypto.randomBytes(32).toString('hex') }),{mode:0o600,flag:'wx'});
const secrets=JSON.parse(fs.readFileSync(file,'utf8'));
const url=(user,password)=>`postgresql://${user}:${password}@127.0.0.1:${secrets.port}/pactum_local`;
const cluster=new EmbeddedPostgres({databaseDir:path.join(root,'postgres'),user:'pactum_local_migrator',password:secrets.admin,port:secrets.port,persistent:true,authMethod:'scram-sha-256',autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-k',root],onLog:()=>{},onError:()=>{}});
let client;
async function command(args){const child=spawn(process.execPath,['node_modules/prisma/build/index.js',...args],{stdio:'inherit',env:{...process.env,CHECKPOINT_DISABLE:'1',DATABASE_URL:url('pactum_local_migrator',secrets.admin),DIRECT_URL:url('pactum_local_migrator',secrets.admin)}});const code=await new Promise(resolve=>child.once('exit',resolve));if(code!==0)throw new Error('Local Prisma migration failed.');}
async function stop(){await client?.end();client=undefined;await cluster.stop();}
try{
 if(!fs.existsSync(path.join(root,'postgres','PG_VERSION')))await cluster.initialise();
 await cluster.start();
 client=cluster.getPgClient('postgres','127.0.0.1');await client.connect();
 if(!(await client.query("SELECT 1 FROM pg_database WHERE datname='pactum_local'")).rowCount)await cluster.createDatabase('pactum_local');
 await client.end();client=cluster.getPgClient('pactum_local','127.0.0.1');await client.connect();
 await client.query('CREATE SCHEMA IF NOT EXISTS auth;CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz);CREATE TABLE IF NOT EXISTS auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz,revoked_at timestamptz);REVOKE ALL ON SCHEMA auth FROM PUBLIC;REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM PUBLIC');
 await command(['migrate','deploy']);
 for(const [name,password,capability]of[['pactum_local_runtime',secrets.runtime,'pactum_runtime'],['pactum_local_worker',secrets.worker,'pactum_worker'],['pactum_local_identity',secrets.identity,null]]){
  if(!(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name])).rowCount)await client.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  if(capability)await client.query(`GRANT ${capability} TO ${name}`);
 }
 await client.query('REVOKE CONNECT ON DATABASE pactum_local FROM PUBLIC;GRANT CONNECT ON DATABASE pactum_local TO pactum_local_runtime,pactum_local_worker,pactum_local_identity;REVOKE CREATE ON SCHEMA public FROM PUBLIC;GRANT USAGE ON SCHEMA auth TO pactum_local_identity;GRANT SELECT,INSERT ON auth.users,auth.sessions TO pactum_local_identity;GRANT UPDATE(email) ON auth.users TO pactum_local_identity;GRANT UPDATE(not_after,revoked_at) ON auth.sessions TO pactum_local_identity');
 const updates={DATABASE_URL:url('pactum_local_runtime',secrets.runtime),WORKER_DATABASE_URL:url('pactum_local_worker',secrets.worker),LOCAL_AUTH_DATABASE_URL:url('pactum_local_identity',secrets.identity),LOCAL_IDENTITY_PROJECTION:'verified_supabase',DIRECT_URL:''};
 let env=fs.existsSync('.env.local')?fs.readFileSync('.env.local','utf8'):'';
 for(const[key,value]of Object.entries(updates)){const line=`${key}=${value}`;const re=new RegExp(`^${key}=.*$`,'m');env=re.test(env)?env.replace(re,line):env+'\n'+line;}
 fs.writeFileSync('.env.local',env.trim()+'\n',{mode:0o600});fs.chmodSync('.env.local',0o600);
 fs.writeFileSync(path.join(root,'migration.env'),`DATABASE_URL=${url('pactum_local_migrator',secrets.admin)}\nDIRECT_URL=${url('pactum_local_migrator',secrets.admin)}\n`,{mode:0o600});
 console.log(`PACTUM PostgreSQL ready on 127.0.0.1:${secrets.port}; database=pactum_local. Runtime and worker URLs written privately to .env.local. Migration credentials remain separate. Ctrl-C stops PostgreSQL and preserves its data.`);
 process.once('SIGINT',()=>{void stop().then(()=>process.exit(0));});process.once('SIGTERM',()=>{void stop().then(()=>process.exit(0));});
 await new Promise(()=>{});
}catch{console.error('Local PostgreSQL startup failed. No remote database was contacted. Check local port availability, role privileges and the Prisma migration output.');await stop().catch(()=>{});process.exitCode=1;}
