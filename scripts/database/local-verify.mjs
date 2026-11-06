import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Client} from 'pg';
const c=JSON.parse(fs.readFileSync('.pactum-local/credentials.json','utf8'));
const connect=async(user,password)=>{const client=new Client({host:'127.0.0.1',port:c.port,database:'pactum_local',user,password,connectionTimeoutMillis:3000});await client.connect();return client;};
const clients=[];
let stage="connect";
try{
 const admin=await connect('pactum_local_migrator',c.admin);clients.push(admin);
 const history=(await admin.query("SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='_prisma_migrations' AND n.nspname IN('pactum','public')")).rows[0];assert.ok(history);
 stage="migration history";
 const migrations=(await admin.query(`SELECT count(*)::int AS count FROM ${history.nspname}._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows[0].count;assert.equal(migrations,5);
 stage="RLS";
 const rls=(await admin.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pactum' AND c.relkind='r' AND c.relname<>'_prisma_migrations' AND c.relrowsecurity AND c.relforcerowsecurity")).rows[0].count;assert.equal(rls,16);
 for(const[name,password]of[['pactum_local_runtime',c.runtime],['pactum_local_worker',c.worker],['pactum_local_identity',c.identity]]){
  stage=name;
  const client=await connect(name,password);clients.push(client);
  const role=(await client.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,has_schema_privilege(current_user,'pactum','CREATE') AS schema_create FROM pg_roles WHERE rolname=current_user")).rows[0];assert.ok(Object.values(role).every(v=>v===false));
  if(name==='pactum_local_runtime'){assert.equal((await client.query('SELECT count(*)::int AS count FROM pactum."ProcurementSession"')).rows[0].count,0);assert.equal((await client.query("SELECT has_table_privilege(current_user,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='users'),'INSERT') AS allowed")).rows[0].allowed,false);}
  if(name==='pactum_local_worker')assert.equal((await client.query("SELECT has_table_privilege(current_user,'pactum.\"FinancialOperation\"','INSERT') AS allowed")).rows[0].allowed,false);
  if(name==='pactum_local_identity')assert.equal((await client.query("SELECT has_table_privilege(current_user,(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='pactum' AND c.relname='Organization'),'INSERT') AS allowed")).rows[0].allowed,false);
 }
 const wrong=new Client({host:'127.0.0.1',port:c.port,database:'pactum_local',user:'pactum_local_runtime',password:'deliberately-invalid',connectionTimeoutMillis:3000});let rejected=false;try{await wrong.connect();}catch{rejected=true;}finally{await wrong.end().catch(()=>{});}assert.ok(rejected);
 console.log(JSON.stringify({database:'pactum_local',host:'127.0.0.1',port:c.port,migrations,forcedRlsTables:rls,restrictedRoles:3,passwordAuthentication:'verified',authUsers:(await admin.query('SELECT count(*)::int AS count FROM auth.users')).rows[0].count,authSessions:(await admin.query('SELECT count(*)::int AS count FROM auth.sessions')).rows[0].count}));
}catch(error){console.error(`Local verification failed at ${stage}; code=${error.code ?? "assertion"}. Credentials and connection strings suppressed.`);process.exitCode=1;}finally{await Promise.all(clients.map(c=>c.end()));}
