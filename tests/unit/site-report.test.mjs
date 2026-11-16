import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAgentFacts } from '../../public/src/agent-source.mjs';
import { buildSiteReport, reportMarkdown } from '../../public/src/site-report.mjs';

// T2 authored source facts and answers. Prepared packet; not native DOM/provider proof.
const facts = patch => ({ title: 'Authored title', description: 'Authored description', canonical: 'https://site.test/', robotsDirectives: [],
  titleCount: 1, descriptionCount: 1, canonicalCount: 1, h1Count: 1, headingCount: 2, wordCount: 25, imageCount: 1,
  missingAltCount: 0, linkCount: 1, unlabeledLinkCount: 0, externalLinkCount: 1, jsonLdCount: 1, invalidJsonLdCount: 0,
  questionHeadingCount: 1, answeredQuestionCount: 1, ...patch });
const agent = patch => ({ mainCount: 1, controlCount: 1, unnamedControlCount: 0, linkCount: 1, nativeLinkCount: 1,
  formCount: 1, nativeFormCount: 1, ...patch });
const source = (path = '/', patch = {}, agents = {}) => ({ url: 'https://site.test' + path, facts: facts(patch), agentFacts: agent(agents), sourceKind: 'supplied', fetchedAt: null });
const coverage = (patch = {}) => ({ scope: 'page', state: 'single_page', discovered: 1, remaining: 0, refused: 0, failed: 0, ...patch });
const answer = patch => ({ brand: 'Example Brand', domain: 'site.test', competitors: ['Other Brand'], engine: 'Authored engine',
  prompt: 'Which tools help with an authored task?', answer: 'Example Brand: https://site.test/reference', observedAt: '2026-11-15T00:00:00.000Z', ...patch });

test('V2-R01 single-page counts keep AI visibility unmeasured and optional agent interfaces absent', () => {
  const result = buildSiteReport({ pages: [source('/', {}, { controlCount: 0, formCount: 0, nativeFormCount: 0 })], coverage: coverage() });
  assert.equal(result.coverage.audited, 1); assert.equal(result.liveProviderMeasurement, false);
  assert.equal(result.suppliedAnswerCount, 0); assert.deepEqual(result.answerGroups, []);
  assert.equal(result.areas.find(area => area.id === 'agents').total, 2);
  assert.deepEqual(result.tasks, []); assert.equal(Object.hasOwn(result, 'score'), false);
});
test('V2-R02 grouped tasks preserve exact affected URLs and prioritize failures before optional patterns', () => {
  const pages = [source('/a', { title: '', titleCount: 0, jsonLdCount: 0 }), source('/b', { title: '', titleCount: 0 })];
  const report = buildSiteReport({ pages, coverage: coverage({ scope: 'site', state: 'frontier_exhausted', discovered: 2 }) });
  assert.equal(report.tasks[0].id, 'seo-title'); assert.equal(report.tasks[0].priority, 1); assert.equal(report.tasks[0].affectedPageCount, 2);
  assert.deepEqual(report.tasks[0].observed.map(row => row.url), ['https://site.test/a', 'https://site.test/b']);
  assert.equal(report.tasks.at(-1).id, 'seo-jsonld'); assert.equal(report.tasks.at(-1).priority, 3);
  assert.match(report.tasks[0].prompt, /untrusted data/); assert.match(report.tasks[0].prompt, /publishing\/indexing intent/);
});
test('V2-R03 cancelled/failed/refused URL counts do not become analyzed pages or complete coverage', () => {
  const report = buildSiteReport({ pages: [source()], coverage: coverage({ scope: 'site', state: 'cancelled', discovered: 6, remaining: 2, refused: 1, failed: 2 }) });
  assert.equal(report.coverage.audited, 1); assert.equal(report.areas.find(area => area.id === 'seo').total, 8);
  const markdown = reportMarkdown(report); assert.match(markdown, /1 analyzed \/ 6 discovered/); assert.match(markdown, /cancelled/);
});
test('V2-R04 impossible coverage, duplicate pages and foreign-host mixing fail without a partial report', () => {
  for (const options of [
    { pages: [source()], coverage: coverage({ discovered: 2 }) },
    { pages: [source(), source()], coverage: coverage({ scope: 'site', state: 'paused', discovered: 2 }) },
    { pages: [source(), { ...source('/b'), url: 'https://foreign.test/' }], coverage: coverage({ scope: 'site', state: 'paused', discovered: 2 }) },
    { pages: [source()], coverage: coverage({ scope: 'site', state: 'frontier_exhausted', discovered: 2, remaining: 1 }) },
  ]) assert.throws(() => buildSiteReport(options), TypeError);
});
test('V2-R05 exact prompts, engines and competitor cohorts stay separate in answer denominators', () => {
  const observations = [answer({}), answer({}), answer({ prompt: 'A different task?' }), answer({ engine: 'Another engine' }), answer({ competitors: [] })];
  const report = buildSiteReport({ pages: [source()], observations, coverage: coverage() });
  assert.equal(report.answerGroups.length, 4); assert.equal(report.suppliedAnswerCount, 5);
  assert.deepEqual(report.answerGroups.map(group => group.answerCount), [2, 1, 1, 1]);
  assert.equal(report.answerGroups[0].ownedCitationCount, 2); assert.equal(report.liveProviderMeasurement, false);
});
test('V2-R06 unrelated and lookalike domains are excluded rather than improving this site’s visibility', () => {
  const observations = [answer({ domain: 'foreign.test' }), answer({ domain: 'not-site.test' }), answer({ domain: 'site.test.foreign.test' }), answer({ domain: 'test' })];
  const report = buildSiteReport({ pages: [source()], observations, coverage: coverage() });
  assert.deepEqual(report.answerGroups, []); assert.equal(report.suppliedAnswerCount, 0);
});
test('V2-R07 brand mentions and explicit owned URL denominators remain distinct', () => {
  const observations = [answer({ answer: 'Example Brand can help.' }), answer({ answer: 'See https://site.test/guide' }), answer({ answer: 'Other Brand can help.' })];
  const group = buildSiteReport({ pages: [source()], observations, coverage: coverage() }).answerGroups[0];
  assert.equal(group.answerCount, 3); assert.equal(group.brandMentionCount, 1); assert.equal(group.ownedCitationCount, 1);
  assert.equal(group.competitors[0].mentionCount, 1);
});
test('V2-R08 source facts and counts are detached without freezing or changing caller evidence', () => {
  const pages = [source()], observations = [answer({})], before = structuredClone({ pages, observations });
  const report = buildSiteReport({ pages, observations, coverage: coverage() });
  assert.deepEqual({ pages, observations }, before); assert.equal(Object.isFrozen(pages[0]), false);
  assert.ok(Object.isFrozen(report)); assert.ok(Object.isFrozen(report.pages[0].checks)); assert.ok(Object.isFrozen(report.answerGroups[0].observations));
});
test('V2-R09 imported HTML keeps its source kind and nonstandard source URL port without claiming a fetch', () => {
  const row = { ...source(), url: 'http://localhost:4567/authored' };
  const report = buildSiteReport({ pages: [row], coverage: coverage() });
  assert.equal(report.pages[0].sourceKind, 'supplied'); assert.equal(report.pages[0].fetchedAt, null);
  assert.match(reportMarkdown(report), /localhost:4567\/authored/);
  assert.throws(() => buildSiteReport({ pages: [{ ...row, fetchedAt: '2026-11-15T00:00:00Z' }], coverage: coverage() }));
});
test('V2-R10 Markdown fences preserve malicious-looking original answers as literal source', () => {
  const original = '```\n<img src=x onerror=alert(1)>\n````\n# not a report heading';
  const report = buildSiteReport({ pages: [source()], observations: [answer({ answer: original })], coverage: coverage() });
  const markdown = reportMarkdown(report);
  assert.ok(markdown.includes('`````\n' + original + '\n`````')); assert.match(markdown, /No live provider was queried/);
});
test('V2-R11 wrong or spoofed facts and credentialed report links are refused', () => {
  assert.throws(() => buildSiteReport({ pages: [{ ...source(), url: 'https://user:secret@site.test/' }], coverage: coverage() }));
  assert.throws(() => buildSiteReport({ pages: [source('/', { missingAltCount: 2 })], coverage: coverage() }));
  assert.throws(() => buildSiteReport({ pages: [source('/', {}, { unnamedControlCount: 2 })], coverage: coverage() }));
  let called = false; const row = source(); Object.defineProperty(row, 'facts', { enumerable: true, get() { called = true; return facts(); } });
  assert.throws(() => buildSiteReport({ pages: [row], coverage: coverage() })); assert.equal(called, false);
});
test('V2-R12 agent source gaps request rendered validation without requiring unoffered form/control interfaces', () => {
  const report = auditAgentFacts(agent({ mainCount: 0, unnamedControlCount: 1, nativeFormCount: 0 }));
  assert.deepEqual(report.counts, { pass: 1, review: 3, fail: 0 });
  assert.match(report.checks.find(check => check.id === 'agent-controls').recommendation, /actual accessibility tree/);
  const none = auditAgentFacts(agent({ controlCount: 0, linkCount: 0, nativeLinkCount: 0, formCount: 0, nativeFormCount: 0 }));
  assert.deepEqual(none.checks.map(check => check.id), ['agent-main']);
});
