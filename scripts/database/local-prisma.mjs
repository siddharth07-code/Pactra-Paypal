// Intentionally ignore .env database settings; use only this dedicated local cluster.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const args=process.argv.slice(2);
if(!['validate','generate'].includes(args[0]) && !(args[0]==='migrate'&&['status','deploy'].includes(args[1])))throw new Error('Only validate, generate, migrate status/deploy are supported.');
const secrets=JSON.parse(fs.readFileSync('.pactum-local/credentials.json','utf8'));
const url=`postgresql://pactum_local_migrator:${secrets.admin}@127.0.0.1:${secrets.port}/pactum_local`;
const child=spawn(process.execPath,['node_modules/prisma/build/index.js',...args],{stdio:'inherit',env:{...process.env,CHECKPOINT_DISABLE:'1',DATABASE_URL:url,DIRECT_URL:url}});
child.once('exit',code=>{process.exitCode=code??1;});
