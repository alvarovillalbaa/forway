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
  approved scope. No testing approval has yet been granted for Forway.
- Source publication to the personal GitHub account is authorized by the
  all-project goal. Do not create a paid plan or new account. Keep exact proof
  and unresolved full-app requirements in the owning docs, not invented status.
