import fs from 'node:fs';

export class DeploymentError extends Error {}
const decode = value => { try { return decodeURIComponent(value); } catch { return value; } };

/** @param {Record<string, string | undefined>} [env] */
export function administratorConnection(env = process.env) {
  let url;
  try { url = new URL(env.BOOTSTRAP_DATABASE_URL || env.DIRECT_URL); }
  catch { throw new DeploymentError('Set a valid BOOTSTRAP_DATABASE_URL in the private operator environment.'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || url.hash) {
    throw new DeploymentError('A PostgreSQL administrator connection with credentials is required.');
  }
  const user = decode(url.username);
  const project = local ? null : env.EXPECTED_SUPABASE_PROJECT_REF;
  if (!local && (!/^[a-z]{20}$/.test(project || '') || user !== `postgres.${project}` ||
      url.port !== '5432' || !url.hostname.endsWith('.pooler.supabase.com') || url.pathname !== '/postgres')) {
    throw new DeploymentError('Pin EXPECTED_SUPABASE_PROJECT_REF and use its postgres Session Pooler connection on 5432.');
  }
  /** @type {false | { rejectUnauthorized: boolean, ca: string }} */
  let ssl = false;
  if (!local) {
    try { ssl = { rejectUnauthorized: true, ca: fs.readFileSync(env.DATABASE_CA_FILE, 'utf8') }; }
    catch { throw new DeploymentError('DATABASE_CA_FILE must identify the trusted readable Supabase CA certificate.'); }
  }
  return {
    local, project, url,
    identity: { host: url.hostname, port: url.port || '5432', database: url.pathname.slice(1), bootstrapRole: user },
    config: { host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 5432), database: url.pathname.slice(1), user,
      password: decode(url.password), ssl, connectionTimeoutMillis: 15000, query_timeout: 30000,
      application_name: 'pactra-deployment-preflight' },
  };
}

export function restrictedUrl(target, role, password, runtime = false) {
  const url = new URL('postgresql://localhost');
  url.hostname = target.url.hostname;
  url.port = runtime && !target.local ? '6543' : target.identity.port;
  url.pathname = target.url.pathname;
  url.username = target.local ? role : `${role}.${target.project}`;
  url.password = password;
  url.searchParams.set('schema', 'pactum');
  if (runtime) {
    url.searchParams.set('connection_limit', '1');
    if (!target.local) url.searchParams.set('pgbouncer', 'true');
  }
  if (!target.local) {
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('sslaccept', 'strict');
    url.searchParams.set('sslcert', 'certs/supabase-ca.cer');
  }
  return url.href;
}
