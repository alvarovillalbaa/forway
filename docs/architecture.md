# Boundaries and data flow

Last updated: 2026-11-15

29 October 2026 architecture; status updated 5 November. The separate
[eight hosted browser workflows](results/2026/11-05/hosted-browser-checks.md)
passed on recorded source `faba7249`; the product boundaries below remain open.

The [product brief](spec.md) owns intent. The browser workbench has three
connected workflows: page audit, content creation/improvement and supplied
AI-answer evidence. The first release is source implementation; it does not
establish a complete shared SEO/GEO platform.

## Local URL tool and source report — 15 November

The local GEN-3659 interface replaces the fixed sidebar with a compact tool
header and central URL input. Existing source/HTML intake, content editor,
supplied evidence and workspace version 1 retain their ownership. The approved
[V2 source](proposals/site-analysis-v2.md) adds separately owned crawl/comparison
controllers and handlers; main and hosting remain the prior edition.

`agent-source.mjs` uses another detached, never-mounted template to observe a
main landmark, native links, control names and non-dialog form destinations.
Unprovided control/form interfaces are omitted rather than counted as failures.
Explicitly hidden nodes are excluded; CSS/layout, the accessibility tree and
actual agent tasks remain unobserved. Pure `auditAgentFacts` derives the checks.

`site-report.mjs` recomputes all checks from validated SEO/GEO and agent facts,
groups non-passing checks into tasks with exact affected URLs, and keeps failed,
refused and pending URLs outside successful-page denominators. Priority orders
observed failures, intent-dependent reviews and optional answer/schema patterns.
It is not a ranking or visibility score. Its multi-page fact contract is ready
for the browser crawler. The legacy page path still declares one page; site
reports declare exact discovered/pending/refused/failed/redirected coverage.
Supplied HTML can retain its original
nonstandard URL port; this is report data, never a network-policy exception.

Supplied AI answers are selected only for this exact declared hostname, then
separated by exact query, engine and brand/domain/competitor
cohort. Mentions and explicit owned-domain URLs have separate denominators.
No supplied answer is relabelled as an automatic provider measurement.

`report-view.mjs` renders through text nodes and known UI elements only. Prompts
retain source evidence as JSON data and require intent/security review before
an edit. Clipboard acknowledgements are fenced to the current report; failed
individual copies expose a selectable field. Markdown exports use dynamically
longer literal fences around user-supplied answers/queries and implementation
prompts. Report/prompt downloads are capped at eight MiB. Original HTML/drafts/
answers remain in the unchanged version-1 workspace; reports are recalculated
after import and never become a separate claimed authoritative measurement.

All69 new T2 cases and six native desktop/390px journeys passed together at
286a88d; [originals and limits](results/2026/11-15/site-analysis-v2/result.md).
Actual upstream DNS/HTTP/provider bytes remain authored, not live proof.

## Website discovery and direct API comparisons

`/api/crawl` admits only `{url,kind}` and shares the importer public-IP pinning,
UTF-8/media/body/deadline checks. Explicit page/robots/sitemap profiles do not
accept request headers or transport overrides. Robots follows up to five
same-host redirects; page/sitemap redirects return to the frontier so the new
origin's policy is checked first. No imported HTML is mounted or executed.

`crawl.mjs` owns serial discovery on one exact hostname. Robots is refetched per
batch;404/410/204 permit an empty policy, other uncertainty pauses. Strict XML
URL sets/indexes reject DTD/entity declarations and unsupported extensions; only
predefined/numeric escaping is decoded. Per batch:
25charged requests,8MiB/60seconds; whole state1000pages/12MiB, export16MiB.
Backpressure retains expansion cursors, raw sources, pending URLs and refusals.
Imported captures are supplied evidence with no asserted fetch time. URL/file
intent and cancellation fence late results. Every batch may be resumed manually.

`provider-comparison.mjs` requires review of1–5exact queries and1–3exact models,
one per provider, ungrounded only. `/api/answer` accepts bounded same-origin JSON
and forwards the caller's own key only to a fixed official HTTPS provider API.
The25second provider/30second route limits,512KiB response,2048output-token
request and no retry are explicit. No deployment key, HTML injection, caller
endpoint, web tool or environment/model selection is accepted. Anthropic's
optional workspace ID stays transient with its own key. Fields clear at end/hide;
no physical memory erasure claim is made.

Native answer text/model/usage/citations/capture time remain with exact cells.
Failed and uncertain calls stay outside successful-answer denominators. Explicit
Resume sends only untouched pending cells. API comparison exports contain no key
or workspace ID; no API archive importer or shared persistence is claimed.
Page workspace1, crawl files and API comparison exports are separate formats.
Client-owned revision/epoch guards protect late imports and changed ownership.

## Public page import

The browser submits only `{url}` to the same-origin `POST /api/audit`. The
handler limits request size/time, validates shape/method/type and delegates to
the public fetcher. That fetcher accepts only HTTP(S) default-port destinations,
checks every resolved address, pins an approved address for the actual socket
and repeats validation after each allowed redirect. It sends no caller cookies,
authorization or headers. Time/bytes/redirects are bounded, compressed content
is not expanded and non-HTML or malformed UTF-8 is rejected.

Returned page data is JSON: URL, HTML, status, bounded selected headers, capture
time and redirect count. Errors are finite public codes/messages, without DNS,
IP, stack, credential or upstream-body disclosure. No arbitrary proxy headers,
methods or caller-supplied network adapter is exposed by the API. The pure test
adapter seam exists in source only, outside the HTTP request contract.

This is one-page source retrieval, not a browser renderer, site crawler or
verified indexing/robots access result. The public endpoint also needs hosted
abuse/operational validation; no durable/global rate enforcement is claimed.
The dedicated threat boundary and check scope must be reviewed before claiming
safe live behavior. The source API is not automatically proof of network isolation.

The [seven native transport identities](results/2026/11-13/native-network.md)
passed once at ce59d9b1 against one owned public host using actual IPv4 DNS,
pinned sockets and authorized TLS. This separately accepts the observed
redirect/byte/media/deadline behavior. The temporary public fixture is removed
from API source after qualification; its authored handler remains under tests.
Broader arbitrary-site, IPv6/platform and durable/global abuse-control proof
remain open. V2 extends document profiles; the closed native packet does not
requalify this changed fetcher or the new provider route.

## Inert page analysis and authored content

Imported HTML is parsed in detached template content, never mounted into the
application, framed, executed or treated as a component tree. The parser extracts
observable facts and the pure audit rules return actionable pass/review/fail
findings. There is no composite SEO/GEO rank or invented AI visibility score.
Source-only analysis cannot see a page's final rendered DOM or performance.

Content drafts remain explicit text and safe source URLs. The HTML/head
generators escape text/attributes and JSON-LD script delimiters. Any FAQ data
must match visible Q&A; schema is not presented as a ranking guarantee.
Re-auditing generated HTML uses the same fact/rule pipeline as the baseline.
The app exports files for the owner's review; it does not update third-party
sites or silently rewrite arbitrary source markup.

## Evidence and workspace ownership

An observation retains raw brand/domain, competitor labels, engine, prompt,
answer and capture time. Analysis counts literal brand/competitor mentions
and explicit HTTP(S) URLs present in that answer; ownership is a domain match.
Mention and citation counts stay separate. These are supplied observations,
not autonomous measurements, sentiment, ranking, revenue or provider data.
Summary rates use answer count, not citation URL count. A mixed summary rejects;
the workspace can retain multiple cohorts and the UI selects them separately.

Workspace version 1 stores only `{version,source,draft,observations}`. Source
is nullable `{url,html,headers}`; draft may be null or incomplete. Headers are
limited to optional `content-type` and `x-robots-tag`. Raw observations are
validated; computed reports, credentials and unknown fields are not persisted.
Files are bounded to 4 MiB, source HTML to 1 MiB and evidence to 500 records.
Imported state is detached/frozen. UI replacement must be explicitly confirmed
and late URL/file reads must not overwrite newer edits or workspace ownership.

Working state is in memory. Export/import is a recovery path, not a shared
database. The portfolio's local PostgreSQL/Supabase-hostable persistence
direction remains open; no schema, account, access policy or capacity change is
applied. Do not swap to another database provider to evade those owner gates.

## Verification boundaries

Syntax/import/assets/document checks are safe without product execution.
Authored pure/API-adapter cases and browser scenarios need explicit approval
under the supplied `AGENTS.md` §7. No paid provider, model or real production
data is needed for the intended focused checks. Hosted page retrieval must be
verified separately from mocked network cases, and mobile behavior separately
from static source. Record failures and exact source hashes in owning results.
