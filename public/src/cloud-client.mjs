const SESSION_KEY = 'forway.session.v1';
const PENDING_KEY = 'forway.pending-write.v1';
const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const credential = value => typeof value === 'string' && value.length <= 16384 && /^[A-Za-z0-9._~-]+$/.test(value);
function error(code) { return Object.assign(new Error(code), { code }); }
function validateSession(value) {
  if (!value || !validId(value.user?.id) || typeof value.user.email !== 'string'
    || !credential(value.accessToken) || !credential(value.refreshToken)
    || !Number.isSafeInteger(value.expiresAt)) throw error('sign_in_required');
  return { user: { id: value.user.id, email: value.user.email }, accessToken: value.accessToken,
    refreshToken: value.refreshToken, expiresAt: value.expiresAt };
}

// Call before the workbench replaces its navigation hash. No token remains in the URL.
export function captureAuthCallback(location, history) {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!['access_token','refresh_token','error','error_description'].some(key => params.has(key))) return null;
  history.replaceState(null, '', location.pathname + location.search);
  const lifetime = Number(params.get('expires_in'));
  const accessToken = params.get('access_token'), refreshToken = params.get('refresh_token');
  if (!credential(accessToken) || !credential(refreshToken) || !Number.isInteger(lifetime)
    || lifetime < 1 || lifetime > 604800) return { invalid: true };
  return { accessToken, refreshToken, expiresAt: Date.now() + lifetime * 1000, recovery: params.get('type') === 'recovery' };
}

export function createCloudClient({ storage, fetchImpl = fetch, changed = () => {} }) {
  let session = null, epoch = 0, refreshing = null;
  const active = new Set();
  function clear() {
    epoch++; session = null; refreshing = null;
    for (const controller of active) controller.abort();
    try { storage.removeItem(SESSION_KEY); } catch { /* In-memory sign-out still takes effect. */ }
    changed();
  }
  async function request(path, body, accessToken, { signal, mutation = false } = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    const stop = () => controller.abort(); active.add(controller);
    signal?.addEventListener('abort', stop, { once: true }); if (signal?.aborted) stop();
    try {
      const response = await fetchImpl(path, { method: body === undefined ? 'GET' : 'POST',
        signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const value = await response.json();
      if (!response.ok) throw error(typeof value?.error?.code === 'string' ? value.error.code : mutation ? 'outcome_unknown' : 'store_unavailable');
      return value;
    } catch (cause) {
      if (cause?.code) throw cause;
      throw error(mutation ? 'outcome_unknown' : 'store_unavailable');
    } finally { clearTimeout(timer); active.delete(controller); signal?.removeEventListener('abort', stop); }
  }
  function accept(value, ticket) {
    if (ticket !== epoch) throw error('account_changed');
    const next = validateSession(value);
    // A session is written only after the server has verified its current user.
    storage.setItem(SESSION_KEY, JSON.stringify(next)); session = next; changed(); return next.user;
  }
  async function ready() {
    if (!session) throw error('sign_in_required');
    if (session.expiresAt > Date.now() + 30000) return session;
    if (!refreshing) {
      const ticket = epoch, previous = session;
      const flight = request('/api/cloud-auth', { action: 'refresh', refreshToken: previous.refreshToken, expectedId: previous.user.id })
        .then(value => { if (value.user?.id !== previous.user.id) throw error('sign_in_required'); accept(value, ticket); return session; })
        .catch(cause => { if (ticket === epoch && cause.code === 'sign_in_required') clear(); throw cause; })
        .finally(() => { if (refreshing === flight) refreshing = null; });
      refreshing = flight;
    }
    return refreshing;
  }
  return {
    get user() { return session?.user ?? null; }, get epoch() { return epoch; },
    settings: () => request('/api/cloud-config'),
    async restore(callback) {
      const ticket = epoch;
      try {
        if (callback?.invalid) throw error('sign_in_required');
        if (callback) {
          const value = await request('/api/cloud-auth', { action: 'session' }, callback.accessToken);
          accept({ ...callback, user: value.user }, ticket); return { recovery: callback.recovery };
        }
        const stored = storage.getItem(SESSION_KEY); if (!stored) return {};
        const previous = validateSession(JSON.parse(stored));
        if (previous.expiresAt <= Date.now() + 30000) {
          const value = await request('/api/cloud-auth', { action: 'refresh', refreshToken: previous.refreshToken, expectedId: previous.user.id });
          if (value.user?.id !== previous.user.id) throw error('sign_in_required'); accept(value, ticket);
        } else {
          const value = await request('/api/cloud-auth', { action: 'session' }, previous.accessToken);
          if (value.user?.id !== previous.user.id) throw error('sign_in_required'); accept({ ...previous, user: value.user }, ticket);
        }
        return {};
      } catch (cause) { if (ticket === epoch) clear(); throw cause; }
    },
    async signin(email, password) {
      clear(); const ticket = epoch;
      const value = await request('/api/cloud-auth', { action: 'signin', email, password });
      return accept(value, ticket);
    },
    async signout() {
      const previous = session; clear();
      if (previous) await request('/api/cloud-auth', { action: 'signout' }, previous.accessToken);
    },
    async account(action, input) {
      const ticket = epoch, current = action === 'password' ? await ready() : null;
      const result = await request('/api/cloud-auth', { action, ...input }, current?.accessToken);
      if (ticket !== epoch) throw error('account_changed'); return result;
    },
    async workspace(command, options = {}) {
      const ticket = epoch, current = await ready();
      if (ticket !== epoch || current.user.id !== session?.user.id) throw error('account_changed');
      const value = await request('/api/workspaces', command, current.accessToken,
        { ...options, mutation: ['create','save','delete'].includes(command.action) });
      if (ticket !== epoch) throw error('account_changed'); return value;
    },
    pending() {
      const value = storage.getItem(PENDING_KEY);
      if (!value) return null;
      const record = JSON.parse(value);
      if (!validId(record.owner) || !validId(record.command?.operationId)
        || !['create','save','delete'].includes(record.command.action)) throw error('pending_invalid');
      return record;
    },
    keepPending(record) {
      if (record.owner !== session?.user.id) throw error('account_changed');
      storage.setItem(PENDING_KEY, JSON.stringify(record));
    },
    clearPending(operationId) {
      if (this.pending()?.command.operationId === operationId) storage.removeItem(PENDING_KEY);
    },
    dispose() { for (const controller of active) controller.abort(); epoch++; },
  };
}
