# Forway

- Product intent is the short Forway Notion brief linked in `docs/spec.md`:
  create, analyze and improve SEO/GEO; consider Omnia and Amplitude. Preserve
  that full scope and separate page heuristics from measured AI visibility.
- No existing app was copied or migrated. The initial source uses native ES
  modules, a browser interface and a bounded public-page import endpoint.
  No dependencies, model calls, accounts, analytics SDK or database are installed.
- Keep imported HTML inert. Never mount imported markup, execute scripts or
  place user content into HTML rendering sinks. Artifact export escapes data.
- Remote page import must validate each redirect, resolve and pin only public
  IPs, reject credentials/nonstandard ports, cap time/bytes and forward no
  cookies/authorization. Never relax this boundary to make an audit succeed.
- Page checks are observable heuristics, not ranking/AI-visibility guarantees.
  AI-answer observations are supplied evidence, with engine/prompt/time and
  explicit denominators. No synthetic metrics or inferred live provider data.
- Working state stays in memory with explicit portable export/import. Shared
  PostgreSQL/Supabase persistence, account ownership and provider integrations
  remain separate decisions; file export is not a shared database.
- Use apply_patch; preserve other work. Syntax/import checks and diff checks
  are safe. Backend/domain tests, browsers, servers and CI need a concrete
  approved scope. The owner's repeated “approve everything / keep going / do
  all the work” instructions authorized the published focused scope. Its 77
  Node fixture cases passed once at `14e7b44a6459602d1a5392eb313273d361db5fad`
  on Node 26.8.2; this is a new runtime profile, not execution of the historical
  Node 24.21.0 preparation. See `docs/results/2026/11-04/local-node-checks.md`
  and its JSON receipt. Preserve the original collector's false order check;
  acceptance requires the exact 77 unique name/status set, not reporter order.
  No rerun occurred. The eight hosted browser workflows subsequently passed
  once at `faba72499adb675bbbef50a01e5c11ecda6f50c2`; see
  `docs/results/2026/11-05/hosted-browser-checks.md`. The two actual API imports
  of owned fixtures and browser/file workflows are separate from mocked Node adapters;
  controlled timing, arbitrary-site safety and full-product proof remain
  separately bounded. Shared persistence/providers remain open. Preserve
  historical seals and do not rerun completed checks
  merely because earlier approval notes are stale.
- Source publication to the personal GitHub account is authorized by the
  all-project goal. Do not create a paid plan or new account. Keep exact proof
  and unresolved full-app requirements in the owning docs, not invented status.

## Hosted browser scope — 5 November 2026

The owner's later standing approval covers the executable original B01–B08
scope in `docs/proposals/hosted-browser-checks.md`: seven desktop cases and one
narrow case in one temporary public Ubuntu CI job per changed candidate,
15 minutes maximum. Pinned Playwright/Chromium installs use owned external
runner storage only; no app dependencies or local environment are installed.
Real API imports target only the two authored public `/check-fixtures/` pages.
Controlled timing responses are separate evidence. Preserve request safety,
served-asset/source/process guards and every failure; retire the QA workflow
after terminal evidence. No account, provider/model, customer data, paid plan,
shared database, arbitrary website or private-address probe is part of this
scope. The previous 77 Node cases are closed and must not be rerun merely for
this new browser packet. Shared persistence/full-product work remains open.
