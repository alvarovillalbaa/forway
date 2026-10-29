import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObservation, observationCohortKey, analyzeObservation, summarizeObservations } from '../../public/src/observations.mjs';

// Supplied authored answer evidence only; no model, engine request or visibility measurement.
const raw = (patch = {}) => ({ brand: 'Acme', domain: 'example.test', competitors: ['Other Co', 'C++'], engine: 'Supplied engine',
  prompt: 'An authored question?', answer: 'Acme is mentioned.', observedAt: '2026-10-29T10:00:00.000Z', ...patch });

test('observation normalization keeps supplied evidence and canonicalizes only the hostname', () => {
  const input = raw({ domain: 'EXAMPLE.test', answer: '  Exact supplied answer.\n' }), output = normalizeObservation(input);
  assert.equal(output.domain, 'example.test'); assert.equal(output.answer, input.answer); assert.equal(output.prompt, input.prompt);
  assert.ok(Object.isFrozen(output)); assert.ok(Object.isFrozen(output.competitors)); assert.notEqual(output.competitors, input.competitors);
  assert.equal(normalizeObservation(raw({ domain: 'bücher.example' })).domain, 'xn--bcher-kva.example');
});

test('raw shapes timestamps names domains and evidence budgets reject malformed records', () => {
  for (const input of [null, { ...raw(), metadata: {} }, { ...raw(), observedAt: '2026-02-30T10:00:00.000Z' },
    raw({ brand: ' Acme' }), raw({ competitors: ['ACME'] }), raw({ competitors: ['Other', 'other'] }), raw({ answer: '' }), raw({ answer: ' \n\t' }), raw({ answer: 'x'.repeat(100001) }),
    raw({ competitors: Array.from({ length: 21 }, (_, index) => `Name ${index}`) }), raw({ answer: '\ud800' })]) assert.throws(() => normalizeObservation(input), TypeError);
  for (const domain of ['https://example.test', 'example.test/path', 'user@example.test', 'example.test:443', 'example.test.', 'bad host']) {
    assert.throws(() => normalizeObservation(raw({ domain })), TypeError);
  }
  let reads = 0; const input = raw(); Object.defineProperty(input, 'answer', { enumerable: true, get() { reads++; return ''; } });
  assert.throws(() => normalizeObservation(input), TypeError); assert.equal(reads, 0);
});

test('brand and competitor detection uses literal Unicode-aware name boundaries', () => {
  const report = analyzeObservation(raw({ brand: 'Café', competitors: ['C++', 'Other.Co'], answer: 'CAFÉ and C++: Other.Co. Not Caféteria or XOther.CoY.' }));
  assert.equal(report.mentions.brand, true); assert.deepEqual(report.mentions.competitors.map(row => row.mentioned), [true, true]);
  for (const answer of ['XCafé', 'Caféine', '字Café字', '_Café_', 'Café\u0301']) {
    assert.equal(analyzeObservation(raw({ brand: 'Café', answer })).mentions.brand, false);
  }
  assert.equal(analyzeObservation(raw({ brand: 'Café', answer: 'Cafe\u0301 is here.' })).mentions.brand, true);
});

test('mentions and actual supplied URL citations are separate evidence', () => {
  const mention = analyzeObservation(raw({ answer: 'Acme without any URL; example.test alone is not an explicit citation.' }));
  assert.equal(mention.mentions.brand, true); assert.deepEqual(mention.citations, []);
  const citation = analyzeObservation(raw({ answer: 'See https://example.test/reference for details.' }));
  assert.equal(citation.mentions.brand, false); assert.deepEqual(citation.citations, [{ url: 'https://example.test/reference', owned: true }]);
});

test('citations retain supplied destinations deduplicate URLs and reject hostname spoofing', () => {
  const report = analyzeObservation(raw({ answer: '[One](https://example.test/a). Again https://example.test/a and https://docs.example.test/b; https://example.test.evil.test/ https://notexample.test/ https://user:secret@example.test/ javascript:unsafe' }));
  assert.deepEqual(report.citations, [
    { url: 'https://example.test/a', owned: true }, { url: 'https://docs.example.test/b', owned: true },
    { url: 'https://example.test.evil.test/', owned: false }, { url: 'https://notexample.test/', owned: false },
  ]);
  assert.equal(analyzeObservation(raw({ answer: 'https://source.test/path_(part)' })).citations[0].url, 'https://source.test/path_(part)');
});

test('summary rates use supplied answer count and count an owned-citing answer only once', () => {
  const reports = [analyzeObservation(raw({ answer: 'Acme and Other Co. https://example.test/a https://example.test/b' })),
    analyzeObservation(raw({ answer: 'Other Co only. https://external.test/' })), analyzeObservation(raw({ answer: 'No named organization is discussed in this authored answer.', engine: 'Another supplied engine' }))];
  const summary = summarizeObservations(reports);
  assert.equal(summary.answerCount, 3); assert.equal(summary.brandMentionCount, 1); assert.equal(summary.ownedCitationCount, 1);
  assert.equal(summary.brandMentionRate, 1 / 3); assert.equal(summary.ownedCitationRate, 1 / 3);
  assert.deepEqual(summary.competitors, [{ name: 'Other Co', answerCount: 3, mentionCount: 2, mentionRate: 2 / 3 },
    { name: 'C++', answerCount: 3, mentionCount: 0, mentionRate: 0 }]);
});

test('empty summaries disclose zero denominator and unknown rates without invented competitors', () => {
  assert.deepEqual(summarizeObservations([]), { answerCount: 0, brandMentionCount: 0, ownedCitationCount: 0,
    brandMentionRate: null, ownedCitationRate: null, competitors: [] });
});

test('campaign identity folds name case and Unicode and ignores competitor order without mixing cohorts', () => {
  const first = raw({ brand: 'Café', competitors: ['Other Co', 'C++'] }), second = raw({ brand: 'CAFE\u0301', domain: 'EXAMPLE.test', competitors: ['c++', 'other co'] });
  assert.equal(observationCohortKey(first), observationCohortKey(second));
  assert.equal(summarizeObservations([analyzeObservation(first), analyzeObservation(second)]).answerCount, 2);
  for (const patch of [{ brand: 'Different' }, { domain: 'other.test' }, { competitors: ['Other Co'] }]) {
    assert.throws(() => summarizeObservations([analyzeObservation(raw()), analyzeObservation(raw(patch))]), TypeError);
  }
});

test('summary validation rejects forged mention or citation annotations and oversized report lists', () => {
  for (const alter of [value => { value.mentions.brand = false; }, value => { value.mentions.competitors[0].mentioned = true; },
    value => { value.citations.push({ url: 'https://example.test/', owned: true }); }, value => { value.extra = true; }]) {
    const report = structuredClone(analyzeObservation(raw())); alter(report); assert.throws(() => summarizeObservations([report]), TypeError);
  }
  assert.throws(() => summarizeObservations(Array.from({ length: 501 }, () => analyzeObservation(raw()))), TypeError);
});

test('analysis is detached and immutable and exposes no sentiment or unsupplied visibility score', () => {
  const input = raw(), before = structuredClone(input), report = analyzeObservation(input), summary = summarizeObservations([report]);
  assert.deepEqual(input, before); assert.ok(Object.isFrozen(report.mentions)); assert.ok(Object.isFrozen(report.citations)); assert.ok(Object.isFrozen(summary.competitors[0]));
  assert.deepEqual(Object.keys(report), [...Object.keys(before), 'mentions', 'citations']);
  for (const key of ['sentiment', 'visibility', 'visibilityScore', 'ranking']) { assert.equal(Object.hasOwn(report, key), false); assert.equal(Object.hasOwn(summary, key), false); }
  input.answer = 'Changed'; assert.equal(report.answer, before.answer);
});
