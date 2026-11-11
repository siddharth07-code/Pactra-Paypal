import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { Client } from 'pg';
import Redis from 'ioredis';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pactra-api-smoke-'));
let admin,auth,proxy,child,redisServer,redisProbe;
const checks=[];
const port=async()=>{const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const p=server.address().port;await new Promise(resolve=>server.close(resolve));return p;};
try {
  const database=new URL(process.env.PACTUM_TEST_ADMIN_URL || '');
  assert.ok(database.hostname==='127.0.0.1' && database.pathname==='/pactum_disposable','Only the disposable harness database is permitted.');
  admin=new Client({connectionString:database.href});await admin.connect();
  const cert=path.join(directory,'fixture-ca.pem'),key=path.join(directory,'fixture-key.pem');
  const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
  assert.equal(generated.status,0,'Local TLS fixture generation failed.');
  const tls={key:fs.readFileSync(key),cert:fs.readFileSync(cert)};
  const redisPort=await port(),redisPassword=crypto.randomBytes(32).toString('hex');
  const redisConfig=path.join(directory,'redis.conf');
  fs.writeFileSync(redisConfig,`bind 127.0.0.1\nport 0\ntls-port ${redisPort}\ntls-cert-file ${cert}\ntls-key-file ${key}\ntls-ca-cert-file ${cert}\ntls-auth-clients no\nrequirepass ${redisPassword}\nsave ""\nappendonly no\n`,{mode:0o600});
  redisServer=spawn(process.env.REDIS_SERVER_BINARY || 'redis-server',[redisConfig],{stdio:'ignore'});
  let redisStartupError;redisServer.on('error',error=>{redisStartupError=error;});
  await new Promise((resolve,reject)=>{
    const deadline=Date.now()+5000;
    const attempt=()=>{const socket=net.connect(redisPort,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',()=>{socket.destroy();if(redisStartupError || Date.now()>deadline)reject(new Error('Disposable TLS Redis did not start.'));else setTimeout(attempt,50);});};attempt();
  });
  redisProbe=new Redis({host:'127.0.0.1',port:redisPort,password:redisPassword,tls:{ca:tls.cert,rejectUnauthorized:true},lazyConnect:true,retryStrategy:()=>100,connectTimeout:1000});
  redisProbe.on('error',()=>{});
  await Promise.race([redisProbe.connect(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Disposable TLS Redis did not start; install redis-server or set REDIS_SERVER_BINARY.')),8000).unref())]);
  assert.ok(!redisStartupError,'Disposable Redis binary unavailable.');
  assert.equal(await redisProbe.ping(),'PONG');checks.push('authenticated TLS Redis');
  const redisUrl=`rediss://default:${redisPassword}@127.0.0.1:${redisPort}`;
  const redisCheck=spawnSync(process.execPath,['--import','tsx','scripts/check-redis.mjs'],{env:{...process.env,REDIS_URL:redisUrl,NODE_EXTRA_CA_CERTS:cert},stdio:'pipe',timeout:15000});
  assert.equal(redisCheck.status,0,'Read-only Redis operator check must verify the disposable TLS endpoint.');
  const appPort=await port();
  const users=new Map(),sessions=new Map();
  const secret=crypto.randomBytes(32),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  auth=https.createServer(tls,async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    const session=sessions.get(req.headers.authorization?.replace(/^Bearer /,''));
    if(req.url.startsWith('/auth/v1/token')){
      let body='';for await(const chunk of req)body+=chunk;
      let input;try{input=JSON.parse(body);}catch{return send(400,{});}
      const user=users.get(input.email);
      if(!user || input.password!=='local-fixture-password')return send(400,{code:'invalid_credentials'});
      const sessionId=crypto.randomUUID();
      const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.profile.id,session_id:sessionId,iss:authOrigin+'/auth/v1',aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600});
      const token=unsigned+'.'+crypto.createHmac('sha256',secret).update(unsigned).digest('base64url');
      sessions.set(token,{profile:user.profile,sessionId,token,revoked:false});
      await admin.query("INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,now()+interval '1 hour')",[sessionId,user.profile.id]);
      return send(200,{access_token:token,refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user:user.profile});
    }
    if(!session || session.revoked)return send(401,{code:'bad_jwt'});
    if(req.url.startsWith('/auth/v1/user'))return send(200,session.profile);
    if(req.url.startsWith('/auth/v1/logout')){session.revoked=true;await admin.query('UPDATE auth.sessions SET not_after=now() WHERE id=$1',[session.sessionId]);return send(204,{});}
    return send(404,{});
  });
  await new Promise(resolve=>auth.listen(0,'127.0.0.1',resolve));
  const authOrigin=`https://127.0.0.1:${auth.address().port}`;
  for(const email of ['buyer@example.test','other@example.test']){
    const id=crypto.randomUUID();
    const profile={id,email,aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{}};
    users.set(email,{profile});
    await admin.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,email]);
  }
  proxy=https.createServer(tls,(req,res)=>{
    const upstream=http.request({hostname:'127.0.0.1',port:appPort,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('error',()=>{res.writeHead(503);res.end();});req.pipe(upstream);
  });
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  const origin=`https://127.0.0.1:${proxy.address().port}`;
  const env={...process.env,NODE_ENV:'production',NODE_EXTRA_CA_CERTS:cert,APP_ORIGIN:origin,SUPABASE_URL:authOrigin,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_fixture_configuration',LOCAL_IDENTITY_PROJECTION:'',LOCAL_AUTH_DATABASE_URL:'',DIRECT_URL:'',GEMINI_API_KEY:'',FX_PROVIDER:'DETERMINISTIC_DEMO',EXCHANGE_RATE_API_KEY:'',CHANNEL3_API_KEY:'',KERNEL_API_KEY:'',PAYPAL_CLIENT_ID:'offline-test-client',PAYPAL_CLIENT_SECRET:'offline-test-secret',PAYPAL_MERCHANT_ID:'TEST-MERCHANT',PAYPAL_WEBHOOK_ID:'fixture-webhook',PAYPAL_BASE_URL:'https://api-m.sandbox.paypal.com',CRON_SECRET:'local-fixture-cron-secret',RATE_LIMIT_BACKEND:'redis',RATE_LIMIT_FAIL_CLOSED:'true',REDIS_URL:redisUrl,NEXT_PUBLIC_TURNSTILE_SITE_KEY:''};
  for(const name of Object.keys(env))if(/^(?:PACTUM_TEST_|BOOTSTRAP_|PACTRA_CREDENTIAL_|DEPLOYMENT_|VERIFIED_BACKUP_)/.test(name))delete env[name];
  const logs=fs.openSync(path.join(directory,'server.log'),'w',0o600);
  child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{env,stdio:['ignore',logs,logs]});fs.closeSync(logs);
  const request=(route,{method='GET',body,jar=new Map(),headers={}}={})=>new Promise((resolve,reject)=>{
    const req=https.request(origin+route,{method,ca:tls.cert,headers:{origin,'content-type':'application/json',cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...headers}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{
        for(const cookie of res.headers['set-cookie'] || []){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
        const text=Buffer.concat(chunks).toString();let data;try{data=JSON.parse(text);}catch{}
        resolve({status:res.statusCode,headers:res.headers,data,text});
      });
    });req.setTimeout(60000,()=>req.destroy(new Error('Local API timeout')));req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){if(child.exitCode!==null)break;try{if((await request('/login')).status===200){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  assert.ok(ready,'Production server did not start. Private fixture logs retained until cleanup.');
  assert.equal((await request('/api/auth/session')).status,401);checks.push('unauthenticated denial');
  const alice=new Map(),bob=new Map();
  const login=async(email,jar)=>{const r=await request('/api/auth/login',{method:'POST',body:{email,password:'local-fixture-password'},jar});assert.equal(r.status,200,'Login failed');assert.ok(r.headers['set-cookie'].some(c=>/HttpOnly/i.test(c)&&/Secure/i.test(c)));};
  await login('buyer@example.test',alice);checks.push('TLS Auth provider and HttpOnly secure login');
  assert.equal((await request('/api/auth/session',{jar:alice})).data.principal.email,'buyer@example.test');
  const initial=await request('/api/organizations',{jar:alice});assert.equal(initial.status,200);assert.equal(initial.data.organizations.length,0);assert.equal(initial.data.active,null);checks.push('fresh authenticated user with zero organizations');
  const orgA=await request('/api/organizations',{method:'POST',body:{name:'Isolated buyer'},jar:alice});assert.equal(orgA.status,201,'Organization creation failed');
  const firstMembership=await request('/api/organizations',{jar:alice});assert.equal(firstMembership.data.organizations.length,1);assert.equal(firstMembership.data.active.id,orgA.data.organization.id);assert.equal(firstMembership.data.active.role,'OWNER');
  const secondOrg=await request('/api/organizations',{method:'POST',body:{name:'Second buyer organization'},jar:alice});assert.equal(secondOrg.status,201);
  const multiple=await request('/api/organizations',{jar:alice});assert.equal(multiple.data.organizations.length,2);assert.equal(multiple.data.active.id,secondOrg.data.organization.id);
  alice.delete('pactum-organization');
  const unselected=await request('/api/organizations',{jar:alice});assert.equal(unselected.data.organizations.length,2);assert.equal(unselected.data.active,null);
  assert.equal((await request('/api/organizations/switch',{method:'POST',body:{organizationId:orgA.data.organization.id},jar:alice})).status,200);
  assert.equal((await request('/api/organizations',{jar:alice})).data.active.id,orgA.data.organization.id);checks.push('OWNER creation and one/multiple organization selection');
  assert.equal((await request('/workspace',{jar:alice})).status,200);checks.push('authenticated workspace and organization persistence');
  await login('other@example.test',bob);
  assert.equal((await request('/api/organizations',{method:'POST',body:{name:'Other organization'},jar:bob})).status,201);
  assert.equal((await request('/api/procurement/sessions',{jar:bob,headers:{'x-organization-id':orgA.data.organization.id}})).status,404);assert.equal((await request('/api/organizations/switch',{method:'POST',body:{organizationId:orgA.data.organization.id},jar:bob})).status,404);checks.push('cross-organization lookup and switch denial');
  const sourced=await request('/api/procurement/init',{method:'POST',jar:alice,body:{rawMandate:{itemQuery:'4K USB-C monitors',quantity:25,maxTotalBudget:1000000,maxDeliveryDays:5,minReturnDays:30,currency:'INR',productDetails:{description:'Preserved manual product details',category:'monitors',referenceUnitPrice:32000,currency:'INR'}}}});
  assert.equal(sourced.status,200,'Sourcing failed');assert.ok(sourced.data.sessionId);checks.push('sourcing with durable restricted-role persistence');
  const negotiated=await request('/api/negotiate/stream',{method:'POST',jar:alice,body:{sessionId:sourced.data.sessionId}});
  assert.equal(negotiated.status,200);assert.ok(negotiated.text.includes('event: NEGOTIATION_COMPLETED'),'Negotiation did not reach its durable completion');checks.push('negotiation SSE completion');
  const sid=sourced.data.sessionId;
  const recovered=await request('/api/procurement/sessions?id='+sid,{jar:alice});
  assert.equal(recovered.status,200);assert.equal(recovered.data.session.auditCertificate.passed,true);
  assert.equal(recovered.data.session.agreementRecord.currency,'INR');assert.equal(recovered.data.session.agreementRecord.supplierCommitmentVerified,false);
  assert.equal(recovered.data.session.mandate.productDetails.description,'Preserved manual product details');
  const quoted=await request('/api/fx/quote',{method:'POST',jar:alice,body:{sessionId:sid}});
  assert.equal(quoted.status,200,'Persisted commercial chain failed FX quotation');
  const locked=await request('/api/fx/lock',{method:'POST',jar:alice,body:{sessionId:sid,quoteId:quoted.data.fxRecord.id}});
  assert.equal(locked.status,200,'Persisted quote failed lock');assert.equal(locked.data.fxVerification.passed,true);
  const replay=await request('/api/fx/lock',{method:'POST',jar:alice,body:{sessionId:sid,quoteId:quoted.data.fxRecord.id}});
  assert.equal(replay.status,200);assert.equal(replay.data.fxRecord.conversionHash,quoted.data.fxRecord.conversionHash);
  const replacement=await request('/api/fx/quote',{method:'POST',jar:alice,body:{sessionId:sid,renew:true}});
  assert.equal(replacement.status,409);
  const durable=await request('/api/procurement/sessions?id='+sid,{jar:alice});
  assert.equal(durable.data.session.fxRecord.status,'LOCKED');assert.equal(durable.data.session.fxVerification.passed,true);
  checks.push('INR agreement → persisted certificate → FX quote/lock/replay/reload with conflicting replacement denied');

  assert.equal((await request('/api/cron/reconcile')).status,401);
  assert.equal((await request('/api/cron/reconcile',{headers:{authorization:'Bearer local-fixture-cron-secret'}})).status,200);checks.push('authenticated worker cron');
  assert.equal((await request('/api/paypal/webhook',{method:'POST',body:{id:'unsigned-fixture',event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{}}})).status,401);checks.push('unsigned webhook denial');
  assert.equal((await request('/api/auth/logout',{method:'POST',body:{},jar:alice})).status,200);
  assert.equal((await request('/api/auth/session',{jar:alice})).status,401);checks.push('logout and session rejection');
  await login('buyer@example.test',alice);
  const restored=await request('/api/organizations',{jar:alice});assert.equal(restored.data.organizations.length,2);assert.equal(restored.data.active.id,orgA.data.organization.id);checks.push('organization selection persists across verified logout/login');
  console.log(JSON.stringify({localProductionApiSmoke:'passed',checks,hostedServicesContacted:false}));
} catch(error) {
  console.error('Local API smoke failed after',checks.at(-1) || 'startup',error.message);
  const log=path.join(directory,'server.log');
  if(fs.existsSync(log))fs.copyFileSync(log,'/private/tmp/pactra-local-api-failure.log');
  process.exitCode=1;
} finally {
  if(child && child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
  if(proxy)await new Promise(resolve=>proxy.close(resolve));
  if(auth)await new Promise(resolve=>auth.close(resolve));
  redisProbe?.disconnect();
  if(redisServer && redisServer.exitCode===null && !redisServer.killed){redisServer.kill('SIGTERM');await new Promise(resolve=>redisServer.once('exit',resolve));}
  await admin?.end().catch(()=>{});fs.rmSync(directory,{recursive:true,force:true});
}
