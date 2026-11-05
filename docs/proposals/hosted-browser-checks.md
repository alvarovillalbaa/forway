# Hosted Forway browser acceptance

5 November 2026. **Prepared; not executed.** This packet makes the original
[B01–B08 workflows](focused-checks.md#controlled-browser-scope) executable.
The owner's later “I approve everything / Keep going / Do all the work”
instructions authorize the required bounded browser-tool installation and
temporary public CI. That standing authorization supersedes the older
connected-Chrome-only executor limitation. No new approval question is needed.
The 77 passing Node fixtures remain a separate closed scope and are not rerun.

The 5 November connected re-read of the [Forway brief](https://app.notion.com/p/408a1ee8bd068047ae66c199a930b339)
returned the same 29 October 07:42:24.129 UTC snapshot (page edit 07:42:00.071,
verification unverified). It still names creating/analyzing/improving SEO/GEO
and considering Omnia/Amplitude, without selecting accounts/providers. This
cached intent record is not evidence of a freshly edited brief or a complete
shared product. The repository's contracts own these focused checks.

## Eight identities and real workflow

Run B01–B07 once as `desktop-chromium` (1440 × 1000) and B08 once as
`narrow-chromium` (390 × 844), one worker, retry zero, no skip/flaky/global
errors and actual Playwright CLI exit zero. Narrow viewport is not physical
touch/device acceptance. The [inactive spec](hosted-browser.spec.mjs.example)
owns the exact titles, UI assertions and authored fixtures; the
[controller](../../scripts/run-hosted-browser.mjs) checks the full identity set.

| Case | Required evidence |
| --- | --- |
| B01 | Actual modules, empty state, section navigation, named dialogs and keyboard/focus behavior; no invented metrics |
| B02 | Real browser POST to the same-origin audit API for the ordinary owned public fixture, actual returned HTML/header facts and all 12 findings |
| B03 | Authored hostile/structured HTML through UI: literal extraction, decoded metadata, Q&A/source facts and no script-created DOM marker |
| B04 | Complete draft editing, inspected and actually downloaded escaped HTML/head bytes, same-check re-audit, and real header-noindex fixture whose directive remains visible after editing |
| B05 | Supplied authored responses in two distinct cohorts, same brand/domain but different competitors, isolated mention/citation answer denominators and preserved original evidence |
| B06 | Actual workspace download and file-chooser restoration with source HTML, both cohorts and incomplete Q&A/source rows; cancellation preserves current work, then a UI-cleared/export-verified empty workspace proves complete recovery; invalid files preserve that restored work |
| B07 | User cancellation/retry and a pending controlled API response followed by a newer edit; stale work cannot replace it and terminal notices remain honest |
| B08 | Narrow audit/content/evidence navigation, overflow/readability, reachable inputs, dialogs and keyboard behavior |

No application private globals, native API monkeypatch or direct application
state seeding substitutes for these UI flows. Downloads and uploads use only
the authored task fixtures and private runner output, never user downloads.
Workspace state lives in a fresh private browser context and is disposable.

B02/B04 use the actual deployed `POST /api/audit` and default server fetcher,
without fulfilling or mocking those responses. The only target URLs are
`https://forway.vercel.app/check-fixtures/authored-page.html` and
`https://forway.vercel.app/check-fixtures/header-noindex.html`.
Successful public-page retrieval exercises the deployed default DNS/HTTPS path;
internal resolver/socket calls are not independently traced. Selected response
HTML/headers must match the authored source. No arbitrary website, private
address, customer content, external provider or unsafe-URL probe is included.
B07's deliberately held own-origin API response is classified as controlled
timing evidence, never real API/DNS proof. Any unsupported file-race coverage
stays unverified rather than using a private hook or guessed delay.

## Network and served source

Install the request guard before first navigation. Permit only enumerated
same-origin startup/static GET/HEAD requests and the exact reviewed JSON audit
POSTs containing one owned fixture URL. Require no caller cookie/authorization
headers. Close WebSockets without connecting. Unexpected paths, methods,
origins, page errors or extra unreviewed responses fail. Literal external source
links may remain data but are never visited. No service worker, account,
analytics SDK, database write, AI/model call or recurring task is used.

Forway serves static native modules; its HTML does not carry a Next deployment
ID. Before activation root must observe exact-source production READY metadata.
During each case hash the real response bytes for the checked index, stylesheet,
icon and all six startup modules against the immutable source manifest.
Record status and matching digests, not a claimed deployment ID extracted from
HTML. These actual asset reads plus deployment metadata and live fixture
responses are separate evidence; they do not trace an internal backend binary.

The bounded per-case boundary attachment records served assets, real versus
controlled API observations and zero unexpected/error counters. The full raw
Playwright JSON is retained before parsing acceptance. Failure-only diagnostic
Markdown may retain only validated contained file metadata; its contents are
not read. Do not upload screenshots, video, traces or HTML artifacts.

The first four authored page errors retain at most 64 UTF-8 bytes of name and
384 bytes of URL-query/fragment-redacted message plus the original fingerprint;
data/blob URLs are redacted and raw stacks are excluded. Any page error still
fails. B07 requires three controlled requests settled, two cancellation events
and one successful retry; these counters do not count as live import evidence.

## Immutable runner and cleanup

Use [the inactive workflow](hosted-browser.workflow.yml.example) only on a push
to `qa/forway-hosted-20261105` in public `alvarovillalbaa/forway`, never active
on main. Pin a 40-hex preparation SHA and the newly READY production deployment
ID; keep production unchanged during the run. Checkout credentials are not
persisted, permissions are read-only and the job is capped at 15 minutes.

Use Node 24.21.0 and pinned Playwright 1.61.1 in owned external Ubuntu 24.04
runner storage, with package install scripts, lock creation, audit and funding
disabled. Install Chromium under that root and Linux libraries only on the
disposable runner. No application
dependency/manifest/lock change, app installation, local environment, build,
server, database or cache/artifact publication is included. Hosted API runtime
is configured as Node 26.x; browser-tool Node 24.21.0 is a different runtime
and does not relabel the earlier Node fixture profile. Linux system packages
remain subject to ephemeral runner teardown rather than independent uninstall.

The frontend E2E skill's optional `browserbase-ui-test` helper is not listed in
this session. Its documented fallback is
`python3 scripts/install-external-skills.py --skill browserbase-ui-test --agent codex`;
that installer was not run. This packet needs no Browserbase account or repeat
of the unresolved connected-Chrome transport recovery.

Protect every tracked input, including binary assets and historical receipts,
using exact HEAD/index/tree/mode/blob/working-byte vectors, with no untracked
or ignored-output exemptions. Run full guards before setup, before/after the
browser and after cleanup. Keep tool modules/cache/config/browser/TMPDIR/spec/
reports/downloads beneath the fresh private external root. Preserve HOME.
No repository symlinks, node_modules or generated repository outputs are used.

Bound work to 12 minutes plus 90 seconds cleanup and two seconds final output.
Capture command stdout/stderr losslessly within fixed caps with byte/SHA/gzip
receipts. Each owned child must exit/close, drain both streams and leave its
original process group absent. Attribute detached Chromium processes only by
same UID, unique owned root paths and kernel PID starttime; revalidate before
any targeted signal. No global kill or broad process cleanup is permitted.
An uncertain/incomplete process or pipe state fails and retains scratch;
delete only positively owned scratch after verified empty final scans.

Preserve each terminal failure before repair or another changed candidate.
Retire the temporary QA workflow after terminal evidence is retained. Do not
rerun the closed 77 Node checks or equate publication/READY with browser proof.
Source-only syntax/import/link/whitespace checks are preparation, not execution.

Local Storage Guard returned 20.8 GiB free against 34 GiB required earlier this
turn. This packet creates no local environment. Passing it does not establish
shared persistence/Auth, analytics attribution, real indexing/rankings,
representative AI visibility, chosen provider integrations, arbitrary-site
import safety, physical assistive technology or full-product completion.
