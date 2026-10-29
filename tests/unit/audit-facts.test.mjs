import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFacts, analyzeHtml } from '../../public/src/audit.mjs';

// Supplied T2 facts only. These cases do not exercise the browser HTML parser.
const facts = (patch = {}) => ({ title: 'An authored page', description: 'A page description.', canonical: 'https://example.test/', robotsDirectives: [],
  titleCount: 1, descriptionCount: 1, canonicalCount: 1, h1Count: 1, headingCount: 2, wordCount: 25, imageCount: 1, missingAltCount: 0,
  linkCount: 1, unlabeledLinkCount: 0, externalLinkCount: 1, jsonLdCount: 1, invalidJsonLdCount: 0, questionHeadingCount: 1, answeredQuestionCount: 1, ...patch });
const check = (report, id) => report.checks.find(value => value.id === id);

test('observed source facts produce finite SEO/GEO checks and internally consistent status counts', () => {
  const report = auditFacts(facts());
  assert.equal(report.checks.length, 12); assert.equal(new Set(report.checks.map(value => value.id)).size, 12);
  assert.deepEqual(report.counts, { pass: 12, review: 0, fail: 0 });
  for (const value of report.checks) { assert.ok(['seo', 'geo'].includes(value.area)); assert.ok(value.label && value.detail && value.recommendation); }
});

test('missing source metadata remains explicit without fabricating content or a visibility score', () => {
  const report = auditFacts(facts({ title: '', titleCount: 0, description: '', descriptionCount: 0, canonical: null, canonicalCount: 0 }));
  assert.equal(check(report, 'seo-title').status, 'fail'); assert.equal(check(report, 'seo-description').status, 'review');
  assert.equal(check(report, 'seo-canonical').status, 'review'); assert.equal(Object.hasOwn(report, 'score'), false);
  assert.match(check(report, 'seo-title').detail, /^0 title/);
});

test('duplicate metadata and multiple or absent primary headings ask for review rather than inventing rules', () => {
  const report = auditFacts(facts({ titleCount: 2, descriptionCount: 2, canonicalCount: 2, h1Count: 2 }));
  for (const id of ['seo-title', 'seo-description', 'seo-canonical', 'seo-h1']) assert.equal(check(report, id).status, 'review');
  assert.equal(check(auditFacts(facts({ h1Count: 0 })), 'seo-h1').status, 'review');
});

test('robots observations distinguish explicit noindex directives from unmeasured crawl access', () => {
  for (const directive of ['noindex, follow', 'googlebot: noindex', 'NONE']) {
    const report = auditFacts(facts({ robotsDirectives: [directive] }));
    assert.equal(check(report, 'seo-robots').status, 'review'); assert.match(check(report, 'seo-robots').recommendation, /robots\.txt/);
  }
  assert.equal(check(auditFacts(facts({ robotsDirectives: ['index, follow'] })), 'seo-robots').status, 'pass');
});

test('image and link checks report observed attributes without pretending to inspect decoration or destinations', () => {
  const report = auditFacts(facts({ missingAltCount: 1, unlabeledLinkCount: 1 }));
  assert.equal(check(report, 'seo-images').status, 'review'); assert.match(check(report, 'seo-images').detail, /Empty alt may intentionally/);
  assert.equal(check(report, 'seo-links').status, 'review'); assert.match(check(report, 'seo-links').recommendation, /No destination or broken-link request/);
  assert.equal(check(auditFacts(facts({ imageCount: 0, missingAltCount: 0 })), 'seo-images').status, 'pass');
});

test('JSON-LD checks concern observed syntax and do not certify schema truth or rich-result eligibility', () => {
  const invalid = auditFacts(facts({ invalidJsonLdCount: 1 }));
  assert.equal(check(invalid, 'seo-jsonld').status, 'review'); assert.match(check(invalid, 'seo-jsonld').recommendation, /does not establish schema correctness/);
  assert.equal(check(auditFacts(facts({ jsonLdCount: 0 })), 'seo-jsonld').status, 'review');
});

test('answer and outbound-reference heuristics remain separate from actual engine citations', () => {
  const report = auditFacts(facts({ questionHeadingCount: 1, answeredQuestionCount: 0, externalLinkCount: 0, wordCount: 0 }));
  for (const id of ['geo-content', 'geo-answers', 'geo-sources']) assert.equal(check(report, id).status, 'review');
  assert.match(check(report, 'geo-sources').recommendation, /not proof of authority/); assert.match(check(report, 'geo-answers').recommendation, /does not.*verify any answer/);
});

test('fact shapes and relationships are strict detached and frozen with no fallback HTML parser', () => {
  for (const patch of [{ imageCount: -1 }, { wordCount: 1.5 }, { h1Count: 3 }, { missingAltCount: 2 }, { answeredQuestionCount: 2 },
    { invalidJsonLdCount: 2 }, { externalLinkCount: 2 }, { canonical: 'javascript:unsafe' }, { extra: true }]) assert.throws(() => auditFacts(facts(patch)), TypeError);
  const input = facts(), before = structuredClone(input), result = auditFacts(input);
  assert.deepEqual(input, before); assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.checks[0])); assert.ok(Object.isFrozen(result.counts));
  assert.throws(() => analyzeHtml({ html: '<h1>Authored</h1>', url: 'https://example.test/' }), /browser inert-template parser/);
});
