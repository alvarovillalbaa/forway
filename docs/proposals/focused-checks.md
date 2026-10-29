# Proposed focused Forway checks

29 October 2026. **Prepared; awaiting explicit approval. No tests or browsers run.**

The new [Forway source](../spec.md) is separate from La Porra, Framelet and all
other previously approved scopes. The supplied `AGENTS.md` §7 and this repo's
instructions require explicit approval for its backend/domain and browser checks.
Source publication and requested Vercel delivery do not supply that test approval.

## Local Node scope

Use the existing Node 24.21.0 installation without installing dependencies,
starting a server or contacting an endpoint. Run exactly these six files:

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

## Controlled browser scope

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
