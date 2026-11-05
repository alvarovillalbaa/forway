# Focused Forway checks — results and remaining browser scope

Prepared 29 October 2026; updated 4 November 2026. **77 Node cases passed once;
eight browser scenarios remain UNRUN.** The owner's repeated “approve everything
/ keep going / do all the work” instructions authorized this focused scope and
supersede its earlier approval-pending note.

The [actual result](../results/2026/11-04/local-node-checks.md) and
[machine receipt](../results/2026/11-04/local-node-checks.json) record source
`14e7b44a6459602d1a5392eb313273d361db5fad`, exit 0 and all 77 exact unique case
names/statuses with zero failures, cancellations, skips or TODOs. This closes the
authored Node fixture scope only, not the browser, actual-network or full-product
requirements below.

## Local Node scope

The original preparation named Node 24.21.0; that runtime profile was not
executed. The one approved invocation used existing Node 26.8.2 within the
declared Node >=22 range, without installation, server or endpoint access.
The supplied six-file arguments were preserved exactly:

```sh
node --test --test-reporter=tap --test-concurrency=1 --test-timeout=10000 \
  tests/unit/fetch-page.test.mjs tests/unit/audit-api.test.mjs \
  tests/unit/content.test.mjs tests/unit/observations.test.mjs \
  tests/unit/audit-facts.test.mjs tests/unit/workspace.test.mjs
```

| File | Cases | Meaningful boundary |
| --- | ---: | --- |
| `fetch-page.test.mjs` | 24 | Destination/IP rules, pinned lookup, redirect validation, deadlines, size/type/encoding limits and owned cleanup with authored adapters |
| `audit-api.test.mjs` | 12 | Method/type/body validation, finite envelopes, request/response cancellation and no leaked internal errors |
| `content.test.mjs` | 8 | Partial draft preservation, publishable artifact validation, escaped HTML/JSON-LD and visible Q&A correspondence |
| `observations.test.mjs` | 10 | Actual nonblank supplied evidence, literal Unicode mentions, explicit URL matches, cohort separation, immutable records and answer denominators |
| `audit-facts.test.mjs` | 8 | Source-fact heuristics and bounds; these do not execute the browser HTML parser |
| `workspace.test.mjs` | 15 | Real source/draft/evidence recovery, partial rows, multi-cohort retention, strict fields/URLs, budgets, accessor rejection and frozen detachment |
| **Total** | **77** | **Authored fixtures only; no network adapter uses the default HTTP/DNS implementations** |

Use the TAP reporter explicitly when recording machine totals, and record the
actual arguments. A 10-second per-case deadline and a 120-second supervisor cap
bound the run. Record Node version/binary hash, source commit/hashes, all case
names, exit/signal, raw output hash and actual pass/fail/cancel/skip/TODO totals
in the owning dated results directory. Expected discovery is exactly 77.

Acceptance requires the exact 77 unique name/status **set**, not file/reporter
order. The original collector added an unrequested argv-order check and marked
its own status failed when Node reported the same cases in another order. That
original object, false order check and complete raw TAP hashes remain unchanged
in the receipt; all mandated exit/name/status/source/resource gates passed.
No assertion, case body or application source was changed, and no rerun occurred.

The full 30-input current source inventory, all 34 tracked path/mode/blob
identities, the original 24 non-Markdown inputs and four historical result files
matched before and after. The runner was reaped, its isolated process group was
absent and owned temp cleanup passed. Individual Node workers and shared-library
dependencies were not independently inventoried; retain these proof limits.

This later documentation edition changes only `AGENTS.md`, `README.md` and this
proposal among the 30 tested inputs, leaving 27 unchanged, including all 24
non-Markdown inputs. The raw JSON and historical receipts/seals remain unchanged.
Reproduce the exact tested commit for runtime evidence.

## Controlled browser scope

The [5 November executable packet](hosted-browser-checks.md) retains these
eight workflows and uses a bounded temporary public Chromium CI job under the
owner's later standing approval. That packet supersedes the historical
connected-Chrome-only executor limitation below. Its browser result remains
pending until an actual terminal receipt is published.

**All eight scenarios below are UNRUN.** The Node cases use authored network/API
adapters and source facts; they do not execute real DNS/HTTP, the deployed API,
browser HTML parsing, UI or file-transfer workflows. No browser acceptance is
inferred from the passing fixture result or initial deployment.

After the source is published and the requested Vercel release is available,
use the existing connected Chrome profile, with authored disposable content.
No new account, browser installation, CI job, database or AI provider is needed.
The two clearly marked public `/check-fixtures/` pages are authored validation
resources, not seeded campaigns, customer pages or measured search outcomes.

| Scenario | Exact workflow |
| --- | --- |
| B01 | Desktop entry: actual module loading, empty state, section navigation, dialogs and keyboard names/focus; no invented metrics |
| B02 | Import the app's own ordinary public fixture through the real same-origin API, including actual DNS/HTTPS and null robot header handling; check all 12 source findings |
| B03 | Paste authored hostile/structured HTML through the UI; check literal extraction, decoded metadata, Q&A/source facts and absent script-created DOM marker; do not claim complete network/XSS coverage |
| B04 | Create/edit complete content, inspect and download escaped HTML/head artifacts, re-audit the same checks; header-noindex fixture must not become an apparent header fix after content editing |
| B05 | Add actual authored responses across two distinct cohorts, including identical brand/domain with different competitors; select each and verify isolated mention/citation answer denominators and original evidence |
| B06 | Export/import the workspace, including source HTML, two cohorts and partial Q&A/source rows; invalid file/replacement cancellation retains current work. Read only task-owned files when the browser supports transfer |
| B07 | Cancel/retry imports, attempt a pending read followed by a newer edit, and verify current work/terminal notices. Deterministic delayed file/network races require supported controls; otherwise record that part unverified |
| B08 | Repeat the principal audit/content/evidence navigation at a supported narrow viewport; inspect overflow, readable labels, input reachability, dialog use and keyboard behavior. Touch/device behavior is not inferred |

Only request the app's own authored public pages through the live importer;
no third-party website, private-network probe, real customer content or provider
is needed. Observe unsupported upload/download/viewport/timing capabilities
and record them without bypassing browser permission boundaries or substituting
source inspection for the missing browser proof. Remove only disposable UI
fixtures after retaining the results; never delete existing user downloads.

If this exact scope exposes a defect, a bounded same-feature repair and rerun
of these cases/scenarios is included. Preserve every failed attempt and changed
source hash. Added tests, CI, installations, broader network/security scanning,
database, real account, provider/model calls, recurring jobs or paid actions
are outside the request. Passing this scope cannot establish real indexing,
search rankings, representative AI visibility, analytics attribution, durable
shared persistence, account access or completion of the full portfolio goal.
