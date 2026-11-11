import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const engine='src/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node';
const certificate='prisma/certs/supabase-ca.cer';
const traces=[];
function visit(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const filename=path.join(directory,item.name);if(item.isDirectory())visit(filename);else if(item.name==='route.js.nft.json')traces.push(filename);}}
try {
  if(!fs.statSync(path.join(root,engine)).isFile())throw new Error('The Vercel Linux Prisma engine was not generated.');
  visit(path.join(root,'.next/server/app'));
  let checked=0;
  for(const trace of traces){const manifest=JSON.parse(fs.readFileSync(trace,'utf8'));const files=new Set(manifest.files.map(filename=>path.resolve(path.dirname(trace),filename)));if(![...files].some(filename=>/libquery_engine-/.test(path.basename(filename))))continue;
    for(const required of [engine,certificate])if(!files.has(path.join(root,required)))throw new Error(`A database route is missing a required engine or CA artifact: ${path.relative(root,trace)}`);
    checked++;
  }
  if(!checked || !traces.some(filename=>filename.endsWith('/api/organizations/route.js.nft.json')))throw new Error('No organization/database route artifact was verified.');
  console.log(`Verified Vercel Prisma engine and public TLS CA in ${checked} database route traces.`);
} catch(error) {console.error(error instanceof Error?error.message:'Build artifact verification failed.');process.exitCode=1;}
