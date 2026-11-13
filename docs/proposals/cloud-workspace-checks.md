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
