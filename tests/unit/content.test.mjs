import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDraft, createHtml, createMetadata } from '../../public/src/content.mjs';

// Authored pure artifact cases; no HTML parser, browser or publication.
const draft = () => ({ url: 'https://example.test/page', title: 'An authored page', description: 'An authored description.',
  heading: 'A real heading', summary: 'A short summary.', body: 'First paragraph.\n\nSecond paragraph.', questions: [], sources: [] });

test('incomplete drafts and partial rows survive normalization as detached frozen data', () => {
  const input = { url: '', title: '', description: '', heading: '', summary: '', body: '', questions: [{ question: 'Why?', answer: '' }], sources: [{ label: '', url: '' }] };
  const result = normalizeDraft(input);
  assert.deepEqual(result, input); assert.notEqual(result, input); assert.notEqual(result.questions[0], input.questions[0]);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.questions)); assert.ok(Object.isFrozen(result.sources[0]));
  input.questions[0].question = 'Changed'; assert.equal(result.questions[0].question, 'Why?');
});

test('draft records reject unknown missing inherited accessor and sparse fields without evaluating getters', () => {
  for (const input of [null, [], { ...draft(), extra: true }, { ...draft(), title: undefined }]) assert.throws(() => normalizeDraft(input), TypeError);
  const missing = draft(); delete missing.body; assert.throws(() => normalizeDraft(missing), TypeError);
  const inherited = Object.assign(Object.create({ private: true }), draft()); assert.throws(() => normalizeDraft(inherited), TypeError);
  const sparse = draft(); sparse.questions = new Array(1); assert.throws(() => normalizeDraft(sparse), TypeError);
  let reads = 0; const accessor = draft(); Object.defineProperty(accessor, 'title', { enumerable: true, get() { reads++; return 'No'; } });
  assert.throws(() => normalizeDraft(accessor), TypeError); assert.equal(reads, 0);
});

test('draft field and row budgets are strict while international text remains intact', () => {
  const limits = { title: 200, description: 500, heading: 300, summary: 2000, body: 50000 };
  for (const [key, limit] of Object.entries(limits)) {
    assert.equal(normalizeDraft({ ...draft(), [key]: 'é'.repeat(limit) })[key].length, limit);
    assert.throws(() => normalizeDraft({ ...draft(), [key]: 'x'.repeat(limit + 1) }), TypeError);
  }
  for (const value of ['\0', '\ud800', '\udc00']) assert.throws(() => normalizeDraft({ ...draft(), body: value }), TypeError);
  assert.throws(() => normalizeDraft({ ...draft(), questions: Array.from({ length: 11 }, () => ({ question: '', answer: '' })) }), TypeError);
  assert.throws(() => normalizeDraft({ ...draft(), sources: Array.from({ length: 21 }, () => ({ label: '', url: '' })) }), TypeError);
  assert.throws(() => normalizeDraft({ ...draft(), questions: [{ question: 'x'.repeat(501), answer: '' }] }), TypeError);
  assert.throws(() => normalizeDraft({ ...draft(), questions: [{ question: '', answer: 'x'.repeat(5001) }] }), TypeError);
  assert.equal(normalizeDraft({ ...draft(), body: '日本語 — café 🧭' }).body, '日本語 — café 🧭');
});

test('draft URLs admit only bounded absolute HTTP(S) addresses or explicit unfinished blanks', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,unsafe', '/relative', 'https://user:secret@example.test/', ' https://example.test', 'https://example.test/\n']) {
    assert.throws(() => normalizeDraft({ ...draft(), url: value }), TypeError);
    assert.throws(() => normalizeDraft({ ...draft(), sources: [{ label: 'Source', url: value }] }), TypeError);
  }
  assert.equal(normalizeDraft({ ...draft(), url: 'https://EXAMPLE.test' }).url, 'https://example.test/');
  assert.throws(() => normalizeDraft({ ...draft(), url: `https://example.test/${'界'.repeat(1000)}` }), TypeError);
  const result = normalizeDraft({ ...draft(), url: 'https://example.test/caf%C3%A9?a=1&b=2' });
  assert.deepEqual(normalizeDraft(result), result);
});

test('both artifact exports require complete identity and rows rather than silently dropping draft intent', () => {
  for (const value of [{ ...draft(), url: '' }, { ...draft(), title: ' ' }, { ...draft(), heading: '' },
    { ...draft(), questions: [{ question: 'Why?', answer: '' }] }, { ...draft(), questions: [{ question: '', answer: 'Because.' }] },
    { ...draft(), sources: [{ label: '', url: 'https://source.test/' }] }, { ...draft(), sources: [{ label: 'Source', url: '' }] }]) {
    assert.throws(() => createHtml(value), TypeError); assert.throws(() => createMetadata(value), TypeError);
  }
});

test('metadata escapes owner text and URL attributes without raw markup or extra scripts', () => {
  const value = { ...draft(), title: '<script>alert("x")</script> & title', description: '" onload="unsafe <tag>', url: 'https://example.test/?a=1&b=2' };
  const output = createMetadata(value);
  assert.match(output, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; title/);
  assert.match(output, /content="&quot; onload=&quot;unsafe &lt;tag&gt;"/);
  assert.match(output, /href="https:\/\/example.test\/\?a=1&amp;b=2"/);
  assert.doesNotMatch(output, /<script>|<tag>|content="" onload=/);
});

test('FAQ JSON-LD round-trips the exact visible authored questions and prevents script breakout', () => {
  const value = { ...draft(), questions: [{ question: 'What does </script><img src=x> mean?', answer: 'Plain <text> & "quotes".\nSecond line.\u2028' }] };
  const output = createHtml(value), json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(output)?.[1];
  assert.ok(json); const data = JSON.parse(json);
  assert.equal(data.mainEntity[0].name, value.questions[0].question); assert.equal(data.mainEntity[0].acceptedAnswer.text, value.questions[0].answer);
  assert.match(output, /<h3>What does &lt;\/script&gt;&lt;img src=x&gt; mean\?<\/h3>/);
  assert.match(output, /Plain &lt;text&gt; &amp; &quot;quotes&quot;\.<br>Second line\./);
  assert.equal((output.match(/<script /g) ?? []).length, 1); assert.doesNotMatch(json, /[<>&\u2028]/u);
});

test('standalone HTML retains paragraph and source content and invents no answers or facts', () => {
  const value = { ...draft(), body: '<b>Not HTML</b>\nline\n\nAnother paragraph.', sources: [{ label: 'A <primary> reference', url: 'https://source.test/?a=1&b=2' }] };
  const before = structuredClone(value), output = createHtml(value);
  assert.match(output, /^<!doctype html>/); assert.match(output, /<h1>A real heading<\/h1>/);
  assert.match(output, /<p>&lt;b&gt;Not HTML&lt;\/b&gt;<br>line<\/p>\n<p>Another paragraph\.<\/p>/);
  assert.match(output, /A &lt;primary&gt; reference/); assert.match(output, /rel="noopener noreferrer"/);
  assert.doesNotMatch(output, /FAQPage|application\/ld\+json|<b>/); assert.deepEqual(value, before);
});
