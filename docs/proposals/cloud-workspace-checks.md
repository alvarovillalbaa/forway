# Account-owned workspace checks

This new source scope uses the owner's standing all-work/checks/publication
authorization. It does not reopen the accepted 77 Node, eight hosted-browser,
seven native-network or one fixture-retirement scopes.

One temporary public Ubuntu CI job, maximum 20 minutes, installs the generated
`pg@8.23.1` lock with lifecycle scripts disabled in owned external scratch.
It runs only `tests/unit/cloud-api.test.mjs` (A01–A15) and
`tests/integration/cloud-store.test.mjs` (P01–P15). The latter really queries a
fresh PostgreSQL 17.12 container through an owned Unix socket, with no container
network or host port. The fixture refuses another server version and applies
the bootstrap only after confirming its namespace does not exist.

The checks cover fresh identity, publishable-only config, verified TLS settings,
HTTP boundaries, ownership/RLS, separate connections, concurrent revisions,
idempotent operations, a real commit followed by authored response loss,
rollback, content deletion, context reset, observed lock cancellation and the
25-workspace limit. Auth HTTP responses and credentials are authored fixtures;
this is not live Supabase/Auth/SMTP or production proof. No model call, paid
plan, local install, existing database, real email, browser or customer data.

The supervisor preserves original exit statuses and streams, image digest,
dependency receipt and full tracked source guards. It removes only its named,
labeled container and owned scratch, uploads bounded evidence, then removes
the uploaded runner copy. Every failed first outcome remains evidence. Disable
the temporary workflow and delete only the SHA-checked task ref after capture.
Source alone is not a working shared product; browser integration and live
configuration remain explicit requirements.

The original 30-case attempt at `53b999d1` has 29 passes and one failed P13
observer. Two earlier attempts never reached tests because the official image
initializer required its default Unix socket. All outcomes are retained.
P13 now owns its fixture independently and clears the transaction's cached
statistics snapshot before observing a lock held by its own admin connection.
The correction runs only P13; the other 29 are not replayed.

The browser/client candidate adds C01–C10 session/receipt cases and U01–U04
authored-response Chromium UI cases. U01/U03/U04 use desktop; U02 uses a 390×844
touch-emulated viewport, not a physical device. The server serves only local
candidate assets, and browser routing refuses foreign origins. No live Auth,
email or database is used in the UI scenarios. This is UI state evidence,
separate from the real PostgreSQL packet. Playwright 1.61.1 and Chromium are
installed only in owned external runner storage. Maximum 20 minutes; no old
scope, model call, account, paid service or production data is added.
