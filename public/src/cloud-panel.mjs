import { createCloudClient, captureAuthCallback } from './cloud-client.mjs';
import { parseWorkspace, serializeWorkspace } from './workspace.mjs';
import { el, replace, action, formatDate } from './ui.mjs';

const messages = {
  sign_in_required: 'Sign in with a confirmed email to open your saved workspaces.',
  account_changed: 'The account changed. Your local work has been kept.',
  revision_conflict: 'A newer saved version exists. Export your local work, reopen the saved version, or save as new.',
  operation_conflict: 'This request ID belongs to another save. Keep your local export and check the saved version.',
  outcome_unknown: 'The save result is unknown. Check its receipt or retry the same saved request below.',
  not_found: 'This saved workspace is unavailable. Your local work has been kept.',
  workspace_limit: 'You have 25 saved workspaces. Delete one before saving another.',
  email_unavailable: 'Email signup and recovery are not available yet.',
  rate_limited: 'Too many account requests. Wait before trying again.',
  pending_invalid: 'The retained request cannot be read. Export your local work before clearing this tab’s site data.',
};

export function mountCloud({ snapshot, applyWorkspace, confirm, notice }) {
  const callback = captureAuthCallback(location, history);
  const panel = document.getElementById('cloud-panel'), status = document.getElementById('cloud-status');
  let settings = null, busy = false, list = [], binding = null, savedRevision = -1, generation = 0, recovery = false;
  let title = '', titleVersion = 0, pendingError = false, seenOwner = null;
  const client = createCloudClient({ storage: sessionStorage, changed: () => {
    const owner = client.user?.id ?? null;
    if (owner !== seenOwner) { seenOwner = owner; list = []; generation++; }
    render();
  } });
  const report = cause => notice(messages[cause?.code] ?? 'The account operation could not finish. Your local work has been kept. Export a copy before leaving.', true);
  const field = (label, input) => el('div', {}, el('label', { for: input.id }, label), input);
  function pending() {
    try { return client.pending(); } catch (cause) { if (!pendingError) report(cause); pendingError = true; return null; }
  }
  function label() {
    status.textContent = client.user ? (binding?.owner === client.user.id && savedRevision === snapshot().revision && !snapshot().unsubmitted
      ? 'Saved to your account' : 'Account connected · local changes need saving') : 'Optional account storage';
  }
  async function run(task) {
    if (busy) return; busy = true; render();
    try { await task(); } catch (cause) { report(cause); }
    finally { busy = false; render(); }
  }
  async function refresh() {
    const ticket = client.epoch, result = await client.workspace({ action: 'list' });
    if (ticket === client.epoch) list = result.workspaces;
  }
  function acceptReceipt(record, result) {
    const receipt = result.receipt;
    if (!receipt || typeof receipt.id !== 'string' || !Number.isSafeInteger(receipt.revision)) throw Object.assign(new Error(), { code: 'outcome_unknown' });
    client.clearPending(record.command.operationId);
    if (record.generation === generation && record.owner === client.user?.id) {
      if (receipt.deleted) { if (binding?.id === receipt.id) { binding = null; savedRevision = -1; } }
      else {
        binding = { ...receipt, owner: record.owner };
        savedRevision = record.titleVersion === titleVersion ? record.localRevision : -1;
      }
    }
    notice(receipt.deleted ? 'Saved content deleted. The local workspace is still available in this tab.'
      : record.generation === generation && savedRevision === snapshot().revision && !snapshot().unsubmitted
        ? 'Workspace saved to your account.' : 'The earlier snapshot was saved. Your local edits or unsubmitted inputs still need saving.');
  }
  async function submit(record) {
    let result;
    try { result = await client.workspace(record.command); }
    catch (cause) {
      if (['revision_conflict','workspace_limit','revision_limit','not_found','invalid_request','invalid_workspace','body_too_large'].includes(cause.code)) client.clearPending(record.command.operationId);
      throw cause;
    }
    acceptReceipt(record, result); await refresh();
  }
  async function save(asNew) {
    if (pending() || pendingError) { notice('Resolve the retained request before starting another save.', true); return; }
    const captured = snapshot(), localGeneration = generation;
    if (captured.unsubmitted && !await confirm('Save the committed workspace?',
      'Unsubmitted source and evidence inputs are not included. Submit them first if you want to save them.', 'Save current workspace')) return;
    if (captured.revision !== snapshot().revision || generation !== localGeneration) return;
    const owner = client.user?.id;
    if (!owner) throw Object.assign(new Error(), { code: 'sign_in_required' });
    if (!asNew && binding && binding.owner !== owner) {
      notice('This local workspace belongs to another account. Use Save as new to make an explicit copy in this account.', true); return;
    }
    if (binding && binding.owner !== owner && !await confirm('Save a copy in this account?',
      'This explicitly uploads the current local source, draft and evidence to the account shown above.', 'Save copy')) return;
    if (captured.revision !== snapshot().revision || generation !== localGeneration || owner !== client.user?.id) return;
    const command = { action: !asNew && binding ? 'save' : 'create', operationId: crypto.randomUUID(), title: title.trim(),
      workspace: parseWorkspace(serializeWorkspace(captured.workspace)),
      ...(!asNew && binding ? { id: binding.id, expectedRevision: binding.revision } : {}) };
    if (!command.title || command.title.length > 120) { notice('Enter a workspace name of up to 120 characters.', true); return; }
    const record = { owner, command, localRevision: captured.revision, generation: localGeneration, titleVersion };
    // Retain the exact command before sending. Storage failure means no write is sent.
    client.keepPending(record); await submit(record);
  }
  async function open(row) {
    if (pending() || pendingError) { notice('Resolve the retained request before opening another workspace.', true); return; }
    const captured = snapshot(), ticket = client.epoch, localGeneration = generation;
    if (captured.hasWork && !await confirm('Open this saved workspace?',
      'This replaces the source, draft, evidence and unsubmitted forms in this tab. Export a copy first if needed.', 'Open saved workspace')) return;
    if (captured.revision !== snapshot().revision || localGeneration !== generation || ticket !== client.epoch) return;
    const value = await client.workspace({ action: 'get', id: row.id });
    if (captured.revision !== snapshot().revision || localGeneration !== generation || ticket !== client.epoch) {
      notice('Your local work changed while opening. It was kept.'); return;
    }
    const normalized = parseWorkspace(serializeWorkspace(value.workspace));
    applyWorkspace(normalized); generation++;
    binding = { ...value.receipt, owner: client.user.id }; savedRevision = snapshot().revision; title = value.title;
    notice('Saved workspace opened. Changes are saved only when you choose Save.');
  }
  async function remove(row) {
    if (pending() || pendingError) { notice('Resolve the retained request before deleting saved content.', true); return; }
    const owner = client.user?.id, ticket = client.epoch;
    if (!await confirm('Delete this saved workspace?', 'This removes its saved source, draft and evidence from your account. The local workspace stays in this tab.', 'Delete saved workspace')) return;
    if (ticket !== client.epoch) return;
    const record = { owner, command: { action: 'delete', id: row.id, expectedRevision: row.revision, operationId: crypto.randomUUID() },
      localRevision: snapshot().revision, generation };
    client.keepPending(record); await submit(record);
  }
  function render() {
    label(); panel.setAttribute('aria-busy', String(busy));
    if (!settings) { replace(panel, el('p', {}, 'Checking account storage…')); return; }
    if (!settings.available) { replace(panel, el('h2', {}, 'Keep a portable copy.'), el('p', {}, 'Account storage is not connected yet. You can keep working, export a workspace file and import it later.')); return; }
    if (!client.user) {
      const email = el('input', { id: 'cloud-email', type: 'email', autocomplete: 'email', required: true, maxlength: 320 });
      const password = el('input', { id: 'cloud-password', type: 'password', autocomplete: 'current-password', required: true, maxlength: 1024 });
      const form = el('form', {}, field('Email', email), field('Password', password), el('button', { type: 'submit', className: 'button', disabled: busy }, 'Sign in'));
      form.addEventListener('submit', event => {
        event.preventDefault(); const address = email.value, secret = password.value; password.value = '';
        void run(async () => { await client.signin(address, secret); await refresh(); });
      });
      const extras = settings.emailEnabled ? el('div', { className: 'button-row' },
        action('Create account', () => { const address = email.value, secret = password.value; password.value = ''; void run(async () => { await client.account('signup', { email: address, password: secret }); notice('If eligible, check your email to confirm your account.'); }); }),
        action('Recover password', () => { const address = email.value; void run(async () => { await client.account('recover', { email: address }); notice('If eligible, check your email for a recovery link.'); }); }))
        : el('p', { className: 'field-help' }, 'Use an existing confirmed account. Email signup and recovery are not enabled yet.');
      replace(panel, el('h2', {}, 'Your work, ready to reopen.'), el('p', {}, 'Sign-in stays in this tab. Your workspace is uploaded only when you save it.'), form, extras); return;
    }
    const name = el('input', { id: 'cloud-name', value: title, maxlength: 120, placeholder: 'Name this workspace', disabled: busy });
    name.addEventListener('input', () => { title = name.value; titleVersion++; savedRevision = -1; label(); });
    const controls = el('div', { className: 'button-row' }, action('Save', () => void run(() => save(false)), 'button'),
      action('Save as new', () => void run(() => save(true)), 'button button-secondary'), action('Refresh list', () => void run(refresh)));
    const record = pending();
    const retained = record ? el('div', { className: 'cloud-pending' },
      el('p', {}, record.owner === client.user.id ? 'A saved request still needs its result confirmed. Keep its original snapshot while resolving it.' : 'A pending request belongs to another account. Sign in to that account to resolve it.'),
      ...(record.owner === client.user.id ? [action('Check receipt', () => void run(async () => {
        const result = await client.workspace({ action: 'operation', operationId: record.command.operationId });
        if (result.receipt) { acceptReceipt({ ...record, generation: -1 }, result); await refresh(); }
        else notice('No receipt is available yet. The request may still be in flight. Retry the original request to resolve it.');
      })), action('Retry original request', () => void run(() => submit({ ...record, generation: -1 })))] : [])) : null;
    const items = list.length ? el('ul', { className: 'cloud-list' }, list.map(row => el('li', {},
      el('div', {}, el('strong', {}, row.title), el('small', {}, 'Version ' + row.revision + ' · ' + formatDate(row.updatedAt))),
      el('div', { className: 'button-row' }, action('Open', () => void run(() => open(row))), action('Delete', () => void run(() => remove(row)))))))
      : el('p', {}, 'No saved workspaces loaded. Save your current work or refresh the list.');
    const password = recovery ? el('input', { id: 'cloud-new-password', type: 'password', autocomplete: 'new-password', minlength: 12, maxlength: 1024 }) : null;
    replace(panel, el('div', { className: 'section-heading' }, el('div', {}, el('h2', {}, 'Saved workspaces'), el('p', { className: 'cloud-identity' }, client.user.email)),
      action('Sign out', () => void run(async () => { try { await client.signout(); notice('Signed out in this tab. Your local work has been kept.'); } catch { notice('Signed out in this tab. Remote session revocation could not be confirmed.'); } }))),
    el('p', { className: 'field-help' }, 'Save explicitly. Files and unsubmitted form inputs are never uploaded automatically.'),
    ...(password ? [field('New password (at least 12 characters)', password), action('Update password', () => { const secret = password.value; password.value = ''; void run(async () => { await client.account('password', { password: secret }); recovery = false; notice('Password updated.'); }); })] : []),
    field('Workspace name', name), controls, retained, el('h3', {}, 'In your account'), items);
    for (const button of panel.querySelectorAll('button')) button.disabled = busy;
  }
  document.getElementById('open-cloud').addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    document.getElementById('open-cloud').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) { render(); panel.focus(); }
  });
  void run(async () => {
    try { settings = await client.settings(); }
    catch (cause) { settings = { available: false, emailEnabled: false }; throw cause; }
    if (settings.available) { const result = await client.restore(callback); recovery = Boolean(result.recovery); if (client.user) await refresh(); }
    if (callback) { panel.hidden = false; document.getElementById('open-cloud').setAttribute('aria-expanded', 'true'); }
  });
  return {
    changed: label,
    detach() { generation++; binding = null; savedRevision = -1; title = ''; titleVersion++; label(); },
    hasUnsaved() { return Boolean(pending() || (binding && savedRevision !== snapshot().revision)); },
    dispose: () => client.dispose(),
  };
}
