import { test, expect } from '@playwright/test';

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const base = 'http://127.0.0.1:43179';
const draft = title => ({ url: '', title, description: '', heading: '', summary: '', body: '', questions: [], sources: [] });
const workspace = title => ({ version: 1, source: null, draft: draft(title), observations: [] });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

async function fixture(page) {
  const rows = new Map(), receipts = new Map(), calls = [], errors = [];
  let sequence = 0, getGate = null, lostCreate = false;
  const getStarted = deferred();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  const user = id => ({ id, email: id === A ? 'a@example.com' : 'b@example.com' });
  const receipt = row => ({ id: row.id, revision: row.revision, contentHash: 'a'.repeat(64), deleted: false,
    createdAt: '2026-11-13T10:00:00.000Z', updatedAt: '2026-11-13T10:00:00.000Z' });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) { errors.push('Foreign request refused: ' + url.origin); await route.abort(); return; }
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/cloud-config') return send({ available: true, emailEnabled: false });
    if (url.pathname === '/api/cloud-auth') {
      const input = route.request().postDataJSON();
      if (input.action === 'signout') return send({});
      const id = input.email === 'b@example.com' || route.request().headers().authorization === 'Bearer authored.B.token' ? B : A;
      if (input.action === 'session') return send({ user: user(id) });
      return send({ user: user(id), accessToken: id === B ? 'authored.B.token' : 'authored.A.token', refreshToken: 'authored-refresh', expiresAt: Date.now() + 3600000 });
    }
    if (url.pathname !== '/api/workspaces') return route.continue();
    const input = route.request().postDataJSON(), owner = route.request().headers().authorization === 'Bearer authored.B.token' ? B : A;
    calls.push({ owner, input });
    const fail = code => send({ error: { code } }, code === 'not_found' ? 404 : 409);
    if (input.action === 'list') return send({ workspaces: [...rows.values()].filter(row => row.owner === owner).map(row => ({ ...receipt(row), title: row.title })) });
    if (input.action === 'operation') return send({ receipt: receipts.get(owner + input.operationId) ?? null });
    const previous = receipts.get(owner + input.operationId); if (previous) return send({ receipt: previous });
    if (input.action === 'create') {
      const id = '33333333-3333-4333-8333-' + String(++sequence).padStart(12, '0');
      const row = { id, owner, title: input.title, workspace: input.workspace, revision: 1 }; rows.set(id, row);
      const result = receipt(row); receipts.set(owner + input.operationId, result);
      if (lostCreate) { lostCreate = false; return route.abort('failed'); }
      return send({ receipt: result });
    }
    const row = rows.get(input.id); if (!row || row.owner !== owner) return fail('not_found');
    if (input.action === 'get') {
      const value = { workspace: row.workspace, title: row.title, receipt: receipt(row) };
      getStarted.resolve(); if (getGate) await getGate.promise;
      return send(value);
    }
    if (row.revision !== input.expectedRevision) return fail('revision_conflict');
    if (input.action === 'delete') {
      rows.delete(row.id); const result = { ...receipt(row), revision: row.revision + 1, contentHash: null, deleted: true };
      receipts.set(owner + input.operationId, result); return send({ receipt: result });
    }
    row.revision++; row.title = input.title; row.workspace = input.workspace;
    const result = receipt(row); receipts.set(owner + input.operationId, result); return send({ receipt: result });
  });
  return { rows, calls, errors, seed() { const id = '33333333-3333-4333-8333-000000000001'; rows.set(id, { id, owner: A, title: 'Saved source', workspace: workspace('Saved draft'), revision: 1 }); sequence = 1; },
    delayGet() { getGate = deferred(); return { started: getStarted.promise, finish: () => getGate.resolve() }; },
    loseCreate() { lostCreate = true; } };
}
async function signin(page, email = 'a@example.com') {
  await page.getByRole('button', { name: 'Saved workspaces', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('authored-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.cloud-identity')).toHaveText(email);
  await expect(page.locator('#cloud-panel')).toHaveAttribute('aria-busy', 'false');
}
async function edit(page, title) {
  await page.getByRole('button', { name: /Content studio/ }).click();
  await page.getByLabel('Page title', { exact: true }).fill(title);
}
async function save(page, title = 'Authored cloud') {
  await page.getByLabel('Workspace name', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

test('U01 desktop explicitly saves, reloads, reopens and deletes; local content survives deletion', async ({ page }) => {
  const f = await fixture(page); await page.goto(base); await signin(page); await edit(page, 'Authored draft');
  await save(page); await expect(page.locator('#cloud-status')).toHaveText('Saved to your account');
  await expect(page.locator('.cloud-list strong')).toHaveText('Authored cloud');
  await page.reload(); await page.getByRole('button', { name: 'Saved workspaces', exact: true }).click();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByLabel('Page title', { exact: true })).toHaveValue('Authored draft');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete saved workspace', exact: true }).click();
  await expect(page.locator('.cloud-list')).toHaveCount(0); expect(f.rows.size).toBe(0);
  await expect(page.getByLabel('Page title', { exact: true })).toHaveValue('Authored draft');
  expect(f.errors).toEqual([]);
  await page.screenshot({ path: process.env.FORWAY_BROWSER_PROOF + '/U01-desktop.png' });
});
test('U02 narrow touch-emulated view keeps newer local edits when a delayed open resolves', async ({ page }) => {
  const f = await fixture(page); f.seed(); const gate = f.delayGet();
  await page.goto(base); await signin(page); await edit(page, 'Earlier local');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: 'Open saved workspace', exact: true }).click();
  await gate.started; await page.getByLabel('Page title', { exact: true }).fill('Newer local edit'); gate.finish();
  await expect(page.locator('#app-notice-text')).toContainText('Your local work changed');
  await expect(page.getByLabel('Page title', { exact: true })).toHaveValue('Newer local edit');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(f.errors).toEqual([]);
  await page.screenshot({ path: process.env.FORWAY_BROWSER_PROOF + '/U02-narrow.png' });
});
test('U03 lost create response retains one request; receipt reconciliation keeps later edits', async ({ page }) => {
  const f = await fixture(page); f.loseCreate(); await page.goto(base); await signin(page); await edit(page, 'Earlier snapshot');
  await save(page); await expect(page.getByRole('button', { name: 'Check receipt', exact: true })).toBeVisible();
  await page.getByLabel('Page title', { exact: true }).fill('Later local edit');
  await page.getByRole('button', { name: 'Check receipt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check receipt', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Page title', { exact: true })).toHaveValue('Later local edit');
  expect(f.calls.filter(call => call.input.action === 'create')).toHaveLength(1); expect(f.rows.size).toBe(1);
  await expect(page.locator('#cloud-status')).toContainText('local changes need saving'); expect(f.errors).toEqual([]);
});
test('U04 switching account keeps local work and requires explicit save-as-new confirmation', async ({ page }) => {
  const f = await fixture(page); f.seed(); await page.goto(base); await signin(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByLabel('Page title', { exact: true })).toHaveValue('Saved draft');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('#cloud-panel')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Email', { exact: true }).fill('b@example.com');
  await page.getByLabel('Password', { exact: true }).fill('authored-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.cloud-identity')).toHaveText('b@example.com');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#app-notice-text')).toContainText('belongs to another account');
  expect(f.calls.filter(call => call.owner === B && call.input.action === 'create')).toHaveLength(0);
  await page.getByRole('button', { name: 'Save as new', exact: true }).click();
  await page.getByRole('button', { name: 'Save copy', exact: true }).click();
  await expect(page.locator('#cloud-status')).toHaveText('Saved to your account');
  expect(f.calls.filter(call => call.owner === B && call.input.action === 'create')).toHaveLength(1); expect(f.errors).toEqual([]);
});
