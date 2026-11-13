import { fail } from './commands.mjs';

export function cloudConfig(env) {
  try {
    const auth = new URL(env.FORWAY_SUPABASE_URL), app = new URL(env.FORWAY_APP_ORIGIN);
    if (auth.protocol !== 'https:' || auth.username || auth.password || auth.search || auth.hash
      || auth.pathname !== '/' || app.protocol !== 'https:' || app.username || app.password
      || app.search || app.hash || app.pathname !== '/') fail('cloud_unavailable');
    const key = env.FORWAY_SUPABASE_PUBLISHABLE_KEY;
    // Privileged and legacy keys are deliberately unsupported in this new installation.
    if (typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{16,512}$/.test(key)) fail('cloud_unavailable');
    return Object.freeze({ authOrigin: auth.origin, appOrigin: app.origin, key,
      emailEnabled: env.FORWAY_EMAIL_ENABLED === 'true' });
  } catch { fail('cloud_unavailable'); }
}

export function databaseConfig(env) {
  try {
    const url = new URL(env.FORWAY_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password
      || !url.hostname || url.hash || url.search || !/^\/[A-Za-z0-9_-]+$/.test(url.pathname)) fail('cloud_unavailable');
    const ca = env.FORWAY_DATABASE_CA;
    if (ca !== undefined && (typeof ca !== 'string' || ca.length > 65536 || !ca.includes('-----BEGIN CERTIFICATE-----'))) fail('cloud_unavailable');
    return { host: url.hostname.replace(/^\[|\]$/g, ''), port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1),
      ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) }, sslnegotiation: 'postgres',
      enableChannelBinding: true, application_name: 'forway-workspaces',
      options: '-c search_path=pg_catalog', connectionTimeoutMillis: 3000,
      statement_timeout: 4000, lock_timeout: 2000, idle_in_transaction_session_timeout: 5000,
      query_timeout: 5000, keepAlive: false };
  } catch { fail('cloud_unavailable'); }
}
