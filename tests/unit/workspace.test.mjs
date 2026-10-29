import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkspace, serializeWorkspace } from '../../public/src/workspace.mjs';

const draft = () => ({ url: 'https://example.com/', title: 'An authored guide', description: 'A fixture description.',
  heading: 'An authored guide', summary: 'A short direct answer.', body: 'Original fixture content.',
  questions: [{ question: 'Who is this for?', answer: 'People evaluating this fixture.' }],
  sources: [{ label: 'Original source', url: 'https://example.org/reference' }] });
const observation = () => ({ brand: 'Orbit', domain: 'example.com', competitors: ['Other'],
  engine: 'Authored engine', prompt: 'An authored question?', answer: 'Orbit is mentioned. https://example.com/reference',
  observedAt: '2026-10-29T10:00:00.000Z' });
const workspace = () => ({ version: 1, source: { url: 'https://example.com/',
  html: '<!doctype html><title>Original fixture</title><h1>Original</h1>',
  headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': null } },
  draft: draft(), observations: [observation()] });
const invalid = action => assert.throws(action, error => error.code === 'invalid_workspace');

test('an empty explicit workspace has no invented source draft or evidence', () => {
  const empty = { version: 1, source: null, draft: null, observations: [] };
  assert.deepEqual(parseWorkspace(serializeWorkspace(empty)), empty);
});

test('export and import preserve the actual source draft and original answer evidence', () => {
  const input = workspace();
  const restored = parseWorkspace(serializeWorkspace(input));
  assert.equal(restored.source.html, input.source.html);
  assert.equal(restored.draft.body, input.draft.body);
  assert.equal(restored.observations[0].answer, input.observations[0].answer);
  assert.equal(restored.observations[0].prompt, input.observations[0].prompt);
  assert.equal(restored.observations[0].observedAt, input.observations[0].observedAt);
  assert.equal(restored.source.headers['x-robots-tag'], null);
});

test('incomplete unsent content remains exportable without an invented destination', () => {
  const input = workspace();
  Object.assign(input.draft, { url: '', title: '', heading: '', description: '' });
  const restored = parseWorkspace(serializeWorkspace(input));
  assert.equal(restored.draft.url, '');
  assert.equal(restored.draft.title, '');
  assert.equal(restored.draft.body, input.draft.body);
});

test('partially written question and source rows survive a recovery round trip', () => {
  const input = workspace();
  input.draft.questions = [{ question: 'Unfinished question', answer: '' }, { question: '', answer: '' }];
  input.draft.sources = [{ label: 'Unfinished reference', url: '' }, { label: '', url: '' }];
  const restored = parseWorkspace(serializeWorkspace(input));
  assert.deepEqual(restored.draft.questions, input.draft.questions);
  assert.deepEqual(restored.draft.sources, input.draft.sources);
});

test('source markup remains data in a portable JSON snapshot rather than an executed preview', () => {
  const input = workspace();
  input.source.html = '<img src="https://example.org/pixel"><script>authoredMarker()</script>';
  const text = serializeWorkspace(input);
  assert.equal(parseWorkspace(text).source.html, input.source.html);
  assert.equal(JSON.parse(text).source.html, input.source.html);
});

test('nullable and omitted source header values retain their own meaning', () => {
  const input = workspace();
  input.source.headers = {};
  assert.deepEqual(parseWorkspace(serializeWorkspace(input)).source.headers, {});
  input.source.headers = { 'x-robots-tag': 'noindex' };
  assert.deepEqual(parseWorkspace(serializeWorkspace(input)).source.headers, input.source.headers);
});

test('computed reports credentials and unknown persisted fields cannot enter the workspace', () => {
  for (const edit of [value => { value.metrics = { visibility: 100 }; },
    value => { value.source.authorization = 'authored-value'; },
    value => { value.source.headers.cookie = 'authored-value'; },
    value => { value.observations[0].mentions = { brand: true }; }]) {
    const input = workspace(); edit(input);
    invalid(() => parseWorkspace(JSON.stringify(input)));
  }
});

test('unsupported versions missing fields and malformed JSON fail with a recoverable finite error', () => {
  for (const value of [null, [], {}, { ...workspace(), version: 2 }, { ...workspace(), version: '1' }]) {
    invalid(() => parseWorkspace(JSON.stringify(value)));
  }
  invalid(() => parseWorkspace('{'));
  invalid(() => parseWorkspace(null));
});

test('source URLs reject executable schemes credentials controls and relative locations', () => {
  for (const url of ['javascript:authored()', 'file:///authored', '/relative', 'https://user:pass@example.com/',
    ' https://example.com/', 'https://example.com/\nnext', 'https://example.com/' + '界'.repeat(500)]) {
    const input = workspace(); input.source.url = url;
    invalid(() => parseWorkspace(JSON.stringify(input)));
  }
});

test('source and header text reject malformed scalars and oversized Unicode input', () => {
  const input = workspace(); input.source.html = '界'.repeat(350000);
  invalid(() => serializeWorkspace(input));
  invalid(() => parseWorkspace(' '.repeat(4 * 1024 * 1024 + 1)));
  for (const text of ['\0', '\ud800', '\udc00']) {
    const html = workspace(); html.source.html = text;
    invalid(() => parseWorkspace(JSON.stringify(html)));
    const header = workspace(); header.source.headers['x-robots-tag'] = text;
    invalid(() => serializeWorkspace(header));
  }
});

test('evidence collections reject more than five hundred records and sparse or accessor arrays', () => {
  const input = workspace(); input.observations = Array.from({ length: 501 }, observation);
  invalid(() => serializeWorkspace(input));
  input.observations = new Array(1);
  invalid(() => serializeWorkspace(input));
  let reads = 0;
  Object.defineProperty(input.observations, '0', { enumerable: true, get() { reads++; return observation(); } });
  invalid(() => serializeWorkspace(input)); assert.equal(reads, 0);
});

test('invalid raw evidence is refused rather than trusted as a previously computed report', () => {
  const input = workspace(); input.observations[0].observedAt = 'unknown';
  invalid(() => parseWorkspace(JSON.stringify(input)));
  input.observations = [{ ...observation(), answer: 12 }];
  invalid(() => serializeWorkspace(input));
});

test('multiple raw cohorts survive recovery without storing or blending their computed summaries', () => {
  const input = workspace(), other = observation();
  Object.assign(other, { brand: 'Different', domain: 'example.org', competitors: ['Separate'] });
  input.observations.push(other);
  const restored = parseWorkspace(serializeWorkspace(input));
  assert.equal(restored.observations.length, 2);
  assert.equal(restored.observations[0].brand, 'Orbit');
  assert.equal(restored.observations[1].brand, 'Different');
  assert.equal(Object.hasOwn(restored, 'summary'), false);
  assert.equal(Object.hasOwn(restored.observations[0], 'mentionRate'), false);
});

test('record accessors and prototype-shaped extras are rejected without reading them', () => {
  const input = workspace(); let reads = 0;
  Object.defineProperty(input.source, 'html', { enumerable: true, get() { reads++; return 'authored'; } });
  invalid(() => serializeWorkspace(input)); assert.equal(reads, 0);
  const extra = JSON.parse('{"version":1,"source":null,"draft":null,"observations":[],"__proto__":{}}');
  invalid(() => serializeWorkspace(extra));
});

test('restored state is detached deeply frozen and cannot mutate a previous workspace', () => {
  const input = workspace(), before = structuredClone(input);
  const restored = parseWorkspace(serializeWorkspace(input));
  const check = value => {
    if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(check); }
  };
  check(restored); assert.deepEqual(input, before);
  assert.throws(() => { restored.draft.body = 'changed'; }, TypeError);
  input.draft.body = 'new intent';
  assert.equal(restored.draft.body, before.draft.body);
});
