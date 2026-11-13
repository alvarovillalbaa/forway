import { fail, uuid } from './commands.mjs';

function token(value) {
  if (typeof value !== 'string' || value.length > 16384 || !/^[A-Za-z0-9._~-]+$/.test(value)) fail('sign_in_required');
  return value;
}
export function bearer(header) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) fail('sign_in_required');
  return token(header.slice(7));
}
function identity(user) {
  if (!user || user.role !== 'authenticated' || user.is_anonymous !== false
    || typeof user.email !== 'string' || !user.email || user.email.length > 320
    || typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at))
    || user.deleted_at || (user.banned_until && Date.parse(user.banned_until) > Date.now())) fail('sign_in_required');
  let id;
  try { id = uuid(user.id); } catch { fail('sign_in_required'); }
  return Object.freeze({ id, email: user.email });
}
export function createAuth({ config, fetchImpl = fetch }) {
  async function request(path, { accessToken, body, signal, method = 'POST' } = {}) {
    let response;
    try {
      response = await fetchImpl(`${config.authOrigin}/auth/v1/${path}`, {
        method, signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { apikey: config.key, Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(accessToken ? { Authorization: `Bearer ${token(accessToken)}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const chunks = []; let size = 0;
      if (response.body) {
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > 65536) fail('auth_unavailable');
          chunks.push(chunk);
        }
      }
      if (!response.ok) fail([400,401,403,422].includes(response.status) ? 'sign_in_required'
        : response.status === 429 ? 'rate_limited' : 'auth_unavailable');
      if (size === 0) return {};
      if (!(response.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) fail('auth_unavailable');
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch (error) {
      if (['sign_in_required','auth_unavailable','rate_limited'].includes(error?.code)) throw error;
      fail('auth_unavailable');
    }
  }
  async function verify(accessToken, signal) {
    return identity(await request('user', { accessToken, signal, method: 'GET' }));
  }
  async function session(data, signal, expectedId) {
    const accessToken = token(data.access_token), refreshToken = token(data.refresh_token);
    if (!Number.isInteger(data.expires_in) || data.expires_in < 1 || data.expires_in > 604800) fail('auth_unavailable');
    const user = await verify(accessToken, signal);
    if (expectedId && user.id !== expectedId) fail('sign_in_required');
    return { user, accessToken, refreshToken, expiresAt: Date.now() + data.expires_in * 1000 };
  }
  return {
    verify,
    async execute(input, accessToken, signal) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_request');
      const action = input.action;
      const shapes = { signin: ['action','email','password'], refresh: ['action','refreshToken','expectedId'],
        session: ['action'], signout: ['action'], signup: ['action','email','password'],
        recover: ['action','email'], password: ['action','password'] };
      if (!Object.hasOwn(shapes, action) || Object.keys(input).length !== shapes[action].length
        || Object.keys(input).some(key => !shapes[action].includes(key))) fail('invalid_request');
      if (Object.hasOwn(input, 'email') && (typeof input.email !== 'string' || input.email.length > 320
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) fail('invalid_request');
      if (Object.hasOwn(input, 'password') && (typeof input.password !== 'string'
        || input.password.length < (action === 'signin' ? 1 : 12) || input.password.length > 1024
        || !input.password.isWellFormed() || input.password.includes('\0'))) fail('invalid_request');
      if (action === 'signin') return session(await request('token?grant_type=password', {
        body: { email: input.email, password: input.password }, signal }), signal);
      if (action === 'refresh') {
        const expectedId = uuid(input.expectedId), refreshToken = token(input.refreshToken);
        return session(await request('token?grant_type=refresh_token', {
          body: { refresh_token: refreshToken }, signal }), signal, expectedId);
      }
      if (action === 'session') return { user: await verify(accessToken, signal) };
      if (action === 'signout') {
        await verify(accessToken, signal);
        await request('logout?scope=local', { accessToken, signal }); return { signedOut: true };
      }
      if (action === 'password') {
        const user = await verify(accessToken, signal);
        const updated = identity(await request('user', { accessToken, signal, method: 'PUT', body: { password: input.password } }));
        if (updated.id !== user.id) fail('sign_in_required');
        return { user: updated };
      }
      if (!config.emailEnabled) fail('email_unavailable');
      const redirect = encodeURIComponent(`${config.appOrigin}/`);
      if (action === 'signup') await request(`signup?redirect_to=${redirect}`, {
        body: { email: input.email, password: input.password }, signal });
      else await request(`recover?redirect_to=${redirect}`, { body: { email: input.email }, signal });
      return { emailRequested: true };
    },
  };
}
