import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateConfiguration } from '../../src/lib/env-validator.ts';

const result = validateConfiguration({ ...process.env, NODE_ENV: 'production' });
const errors = [...result.errors];
const project = process.env.EXPECTED_SUPABASE_PROJECT_REF;
if (process.env.SUPABASE_URL !== `https://${project}.supabase.co`) errors.push('SUPABASE_URL must identify the pinned Supabase project.');
if ((process.env.CRON_SECRET || '').length < 32) errors.push('CRON_SECRET must contain at least 32 characters.');
for (const [key, role] of [['DATABASE_URL','pactum_app'],['WORKER_DATABASE_URL','pactum_jobs']]) {
  try {
    const url = new URL(process.env[key]);
    if (!/^[a-z]{20}$/.test(project || '') || url.username !== `${role}.${project}` ||
        !url.hostname.endsWith('.pooler.supabase.com') || url.port !== '6543' || url.pathname !== '/postgres' ||
        url.searchParams.get('schema') !== 'pactum' || url.searchParams.get('pgbouncer') !== 'true' ||
        url.searchParams.get('sslmode') !== 'require' || url.searchParams.get('sslaccept') !== 'strict' ||
        url.searchParams.get('sslcert') !== 'certs/supabase-ca.cer') throw new Error();
  } catch { errors.push(`${key} must use the prepared restricted Supabase transaction-pooler configuration.`); }
}
for (const key of ['DIRECT_URL','MIGRATION_DATABASE_URL','BOOTSTRAP_DATABASE_URL','LOCAL_AUTH_DATABASE_URL','LOCAL_IDENTITY_PROJECTION','NEXT_PUBLIC_TURNSTILE_SITE_KEY']) {
  if (process.env[key]) errors.push(`${key} must be absent from the application environment.`);
}
if (process.env.RATE_LIMIT_BACKEND !== 'redis' || !/^rediss?:\/\//.test(process.env.REDIS_URL || '')) errors.push('Set RATE_LIMIT_BACKEND=redis and a real REDIS_URL for shared Vercel rate limiting.');
if (process.env.PAYPAL_BASE_URL !== 'https://api-m.sandbox.paypal.com') errors.push('PAYPAL_BASE_URL must identify PayPal Sandbox.');
try {
  const certificate = new crypto.X509Certificate(fs.readFileSync('prisma/certs/supabase-ca.cer'));
  if (!certificate.ca || Date.parse(certificate.validTo) <= Date.now()) throw new Error();
} catch { errors.push('The packaged Supabase CA must be a valid unexpired CA certificate.'); }
const requiredOperatorValues = ['APP_ORIGIN','PAYPAL_WEBHOOK_ID','REDIS_URL'].filter(key => !process.env[key]?.trim());
console.log(JSON.stringify({ valid: errors.length === 0, requiredOperatorValues, errors, warnings: result.warnings, networkRequests: 0, credentialsPrinted: false },null,2));
if(errors.length)process.exitCode=1;
