# Boundaries and data flow

29 October 2026. Initial source, execution/deployment acceptance pending.

The [product brief](spec.md) owns intent. The browser workbench has three
connected workflows: page audit, content creation/improvement and supplied
AI-answer evidence. The first release is source implementation; it does not
establish a complete shared SEO/GEO platform.

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
