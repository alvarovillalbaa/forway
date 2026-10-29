# Initial source and hosting delivery

29 October 2026. Forway is published to personal GitHub and Vercel reports the
initial deployment **READY** at [forway.vercel.app](https://forway.vercel.app).
The **77 Node cases and eight browser scenarios remain unexecuted**, pending
the separately requested [focused scope](../../../proposals/focused-checks.md).

## Verified delivery

Source is
[`98d6761482b464ce23f8edaaa932b14999d808ce`](https://github.com/alvarovillalbaa/forway/commit/98d6761482b464ce23f8edaaa932b14999d808ce).
The connected GitHub ref/tree matched all 32 file paths, modes, types and blob
SHAs without truncation; main had no active workflow and the checkout was clean.
The original [preparation seal](initial-source.json) and
[source receipt](initial-source.md) preserve the unexecuted-check boundary.
The seal applies to that published preparation snapshot; later README and
architecture status edits do not change any runtime/test/asset input.

Existing Clous Team owns project `prj_y86aQbsCfHiDJvY5tFiTFV5cTnFa`, with its
Git link to `alvarovillalbaa/forway` independently verified. Deployment
`dpl_FmfouDwbw16MfwhrV2fuHrnu7n8Z` reports READY for that exact source. Its
build log shows Node **26.13.0**, 15 parsed modules/15 resolved relative imports,
successful output generation and deployment. The project command was
`node --version`, with `node scripts/check.mjs` for source checking; Vercel's
native function builder also ran an empty-dependency npm step. No package was
added to the source and no local installation occurred.

The live root document returned HTTP 200 and matched the source index byte for
byte: 14,433 bytes, SHA-256
`938f091d48f57fb1f12a6c4d4cd4d666355769d07d912d600d120c0b09d3bdfc`.
This is static delivery proof, not a browser, API, DNS/TLS-adapter or artifact
workflow pass. The [machine receipt](initial-delivery.json) retains exact build
events, identities, attempts and limits.

## Provider outcomes retained

The Git-project creation tool returned a response-schema error after HTTP 200.
Readback established that one project and its intended Git link were created;
no deployment existed. An initial deployment request then failed explicitly
with HTTP 400 `missing_project_settings`. A second read confirmed no deployment
before the corrected request supplied settings matching the repository.

The corrected request selected **preview**, but Vercel returned and independently
reported **production**, assigning the canonical alias. No separate promotion
was performed and no duplicate project/build was created. This actual target
is recorded rather than reporting the requested preview as fact. Existing
team protection settings were retained; no Auth policy was edited.

## Remaining proof and scope

The planned local cases use existing Node **24.21.0**; the hosted build's version
is recorded separately. Build parsing does not establish functional behavior
on either runtime. Functional/default-network/browser execution still requires
the new explicit §7 approval. No model/provider account, real customer data,
database, migration, CI, paid enrollment or new account was used.

The workbench implements a useful first create/analyze/improve workflow, while
shared PostgreSQL/Supabase persistence, chosen analytics/AI integrations and
actual indexing/search/representative AI outcomes remain open. This delivery
does not complete the full product or portfolio goal.
