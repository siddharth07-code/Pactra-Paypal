import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { engineTarget, engineDirectory } from './linux-schema-engine.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
try {
  if (!(['validate'].includes(args.join(' ')) || ['migrate status', 'migrate deploy'].includes(args.join(' ')))) throw new Error('Use validate, migrate status, or migrate deploy. No other database commands are permitted.');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS verification must remain enabled.');
  const project = process.env.EXPECTED_SUPABASE_PROJECT_REF;
  if (!/^[a-z]{20}$/.test(project || '')) throw new Error('Set EXPECTED_SUPABASE_PROJECT_REF to the intended project.');
  const url = new URL(process.env.DIRECT_URL || '');
  if (process.env.DATABASE_URL !== process.env.DIRECT_URL || url.protocol !== 'postgresql:' ||
      decodeURIComponent(url.username) !== `pactum_migrator.${project}` || !url.password || url.pathname !== '/postgres' ||
      !url.hostname.endsWith('.pooler.supabase.com') || url.port !== '5432' || url.searchParams.get('schema') !== 'pactum' ||
      url.searchParams.has('pgbouncer') || url.searchParams.get('sslmode') !== 'require' || url.searchParams.get('sslaccept') !== 'strict' ||
      url.searchParams.get('sslcert') !== 'certs/supabase-ca.cer' || url.searchParams.has('sslrootcert')) throw new Error('Use the prepared restricted migrator environment with matching datasource URLs and strict Session Pooler TLS.');
  const ca = path.join(root, 'prisma/certs/supabase-ca.cer');
  fs.accessSync(ca, fs.constants.R_OK);
  url.searchParams.set('sslcert', ca);
  const env = { ...process.env, DATABASE_URL: url.href, DIRECT_URL: url.href };
  if (process.platform === 'darwin') {
    const require = createRequire(import.meta.url);
    const { download, BinaryType } = require('@prisma/fetch-engine');
    const { enginesVersion } = require('@prisma/engines-version');
    fs.mkdirSync(engineDirectory, { recursive: true, mode: 0o700 });
    // Prisma's downloader verifies the matching binary's published SHA-256 checksum.
    delete process.env.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING;
    await download({ binaries: { [BinaryType.SchemaEngineBinary]: engineDirectory }, version: enginesVersion, binaryTargets: [engineTarget], showProgress: false });
    env.PRISMA_SCHEMA_ENGINE_BINARY = fileURLToPath(new URL('./linux-schema-engine.mjs', import.meta.url));
    console.log('Using the version-matched Linux Prisma TLS engine in local Docker; certificate and hostname verification remain enabled.');
  }
  const child = spawn(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), ...args, '--schema', path.join(root, 'prisma/schema.prisma')], { cwd: root, env, stdio: 'inherit' });
  child.on('error', () => { console.error('Prisma could not start.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) {
  // Never print URL parsing inputs, engine request bodies, or provider exception objects.
  console.error('Hosted Prisma preflight stopped.', error instanceof TypeError ? 'Invalid migration connection configuration.' : error.message);
  process.exitCode = 1;
}
