# Site analysis V2 — implementation checkpoint

Historical preparation/first-failure checkpoint. The terminal packet passed and
retired; [result.md](result.md) owns current status. Do not read the pending
language below as a new execution or outstanding repeat request.

Owner authority: “Autorizo todo”, for the named proposal. Isolated CI is capped
at20aggregate job minutes including failures and retirement. No application
dependency, account, database, production environment/project, key creation or
actual model/public-site operation is authorized by this packet.

Current source adds fixed crawl-document profiles to the existing public pinned
fetcher, a separate `/api/crawl`, a one-host serial browser crawler, robots and
strict sitemap parsers, separate provider answer adapters and `/api/answer`,
reviewed API comparison state and a new browser interface. The legacy single-page
API shape and version1 page/draft/supplied-observation workspace remain available.
Website crawls and API comparisons have explicitly separate exports.

The crawler checks robots per origin before pages/sitemaps. The same-host robots
profile follows up to five redirects; page/sitemap redirects are observations
and return to the frontier so target-origin robots are checked before retrieval.
All sockets reuse the existing public-IP validation/pinning, no caller headers,
uncompressed UTF-8, oneMiB and eight-second boundaries. The strict XML subset
supports URL sets/indexes, namespace prefixes, comments and predefined/numeric
escaping; it rejects DTD/entity declarations, malformed XML and unsupported
extension markup. Optional metadata is not XSD/date validated. Gzip/feed/text
sitemap formats are outside this profile and remain visible failures.

Per batch:25charged requests,8MiB charged bytes and60seconds. Unknown costs use
conservative upper bounds; observed response bytes are separate. Whole-state
capacity is1000captured pages/12MiB, with16MiB export. Queue backpressure retains
source/candidate cursors instead of dropping a page sample. Capacity pauses
remain visible; a drained discoverable frontier is not every page on the domain.
Exported state retains raw captured HTML and pending work; imported captures
become supplied evidence and policies are refetched on resume. Redirect aliases,
refused/failed URLs and pending sitemap/expansion work stay separate from audited
page denominators. XML child URLs respect same-host/directory scope.

Provider routes take only a reviewed provider/model/query/mode and its own caller
key in JSON. They never consume deployment keys, accept caller endpoints, inject
site HTML/brand into prompts, follow redirects or retry. OpenAI Responses,
Anthropic Messages (version2026-10-21) and Google generateContent use distinct
fixed official HTTPS targets/headers. Only ungrounded requests are implemented;
no web tool is requested, and no consumer-product/AI Overview measure is claimed.
An unscoped Anthropic key can supply its own workspace ID in memory.

Comparison plans contain up to5exact queries ×3models, at most one per provider.
Preparing/reviewing does not query a provider. Actual callers must explicitly
confirm the exact plan and provide each selected key. Each cell is attempted
once; cancellation/uncertain acceptance remains unknown and explicit Run resumes
only untouched pending cells. Keys are omitted from plan/results/exports, input
fields clear at run completion/page hiding, and known same-origin validation
rejections are distinct from uncertain provider outcomes. JavaScript is not a
physical-memory zeroization guarantee. Original answer text, exact query,
requested/reported models, native citation metadata, native usage and capture
time are retained when supplied. Failed/unknown/missing cells never become zero
visibility or enter successful-answer denominators. Supplied answer records stay
separate from direct API results.

Local Node26.8.2 execution so far:32initial crawl/report cases passed. The provider
packet first had19/20pass because the authored timestamp expected no milliseconds;
the canonical ISO expectation was corrected and all20passed. The combined
66-case packet first had65pass: a test brand matched the literal domain in an
answer URL, so expecting no brand mention was incorrect. A distinct brand/domain
fixture corrected that expectation and all66passed in one invocation. Every
original stdout/stderr remains local. Failed local TAP includes local paths and
must not be blindly published. Three subsequent malformed-scalar/XML/rejection
identities brought the changed packet to69; all69 passed together in local
attempt6. Static parsing/import/HTML-target checks pass at the recorded
checkpoint; they do not execute product code, native DOM, clipboard or providers.

The first isolated candidate `e21f9fcd25a719a88cd13e703d1cc1a75008a7b1`
ran in job132995773693/run43773936198 for59seconds. All69 controls and
F01–F05 passed; F06 timed out waiting for a single-page report because the driver
had not acknowledged the real replacement confirmation. The native clipboard
and390px no-overflow observations had already passed, but F06 remains failed.
All34 originals remain in `attempt-1/`; all contexts/browser, six command
groups and the server closed, source vectors matched and owned scratch was
removed. The driver now explicitly reviews/accepts that confirmation. A changed
candidate is undergoing isolated acceptance; no unchanged candidate was replayed.

Main remains
`f9ec9a35c6f05e579d95fc155f430f2a56debbf1`; local dirty/index/refs and the unrelated
untracked9November review are preserved. Main's hosted project is unchanged.
Terminal desktop/390px acceptance, publication of reviewed evidence and QA
retirement remain required. The old
77Node/eight-browser/seven-native packets stay closed and are not rerun here.

The new answer route has a30-second overall source deadline (including bounded
input and25-second provider work). Its eventual hosting needs a compatible
function duration; no hosted runtime setting is changed or verified here.

## Primary contracts inspected

- [RFC9309](https://www.rfc-editor.org/info/rfc9309/): group merging, wildcard
  fallback, octet/path matching, allow ties, special characters, access results,
  five redirects, parseable lines,500KiB minimum and cache/security boundaries.
  The selected one-host security scope refuses foreign-host robots redirects.
  Only404/410missing robots and204empty policy are allowed automatically;
  other4xx,5xx and transport/parser uncertainty stop rather than infer access.
  Policies are refetched per batch; exported policy data never grants authority.
- [Sitemap protocol](https://www.sitemaps.org/protocol.html): UTF-8, namespace,
  required locations, indexes, escaping and location/same-host constraints.
- [OpenAI text generation](https://developers.openai.com/api/docs/guides/text)
  and [Responses reference](https://developers.openai.com/api/reference/resources/responses/methods/create):
  fixed POST, Bearer auth, exact input, output message/text aggregation and
  explicit incomplete status. The direct documentation reference fetch was a
  generated stub; the official guide and web reference supplied actual fields.
- [Claude Messages](https://platform.claude.com/docs/en/api/messages/create)
  and [API overview](https://platform.claude.com/docs/en/api/overview): request
  fields, versioned auth/workspace headers,
  end-turn status, text/citations and native usage. Limits above are Forway's.
- [Google generateContent](https://ai.google.dev/api/generate-content)
  and [API authentication](https://ai.google.dev/api): fixed versioned endpoint,
  own-key header, candidate/finish state, citation metadata and native usage.

No documentation example model was selected as an application default, and no
API key setup flow or real provider call ran. Current credentials/models/targets
and hosted acceptance remain a separately authorized live rollout.
