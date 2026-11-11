// Read-only authenticated connectivity check. Run with a private --env-file, never a URL argument.
import Redis from 'ioredis';
import { ensureRedisReady, redisConnectionOptions } from '../src/lib/redis-connection.ts';

let client;
try {
  const value=process.env.REDIS_URL || '';
  client=new Redis(value,redisConnectionOptions(value,true));
  client.on('error',()=>{});
  await ensureRedisReady(client);
  const pong=await client.ping();
  const tls=client.connector.stream;
  if(pong!=='PONG' || !tls?.encrypted || !tls?.authorized)throw new Error();
  console.log(JSON.stringify({healthy:true,authenticatedPing:true,tlsVerified:true,hostname:new URL(value).hostname}));
} catch {
  console.error(JSON.stringify({healthy:false,error:'Redis configuration, authenticated TLS connection, or PING failed. Check the Production URL, credential, database availability, and network allowlist.'}));
  process.exitCode=1;
} finally { client?.disconnect(); }
