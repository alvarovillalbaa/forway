# Private account workspace qualification

The server foundation is source `53b999d1`; browser/client integration is
`9588550f` on `work/private-workspaces`. Main/production remain the accepted
memory/export release at `f9ec9a35`. No live database, Auth setting, account,
email, privileged key or production environment was changed.

The work branch has a Vercel READY preview `dpl_D39pf7TiGjJMQfbpSMvnLF9sLDup`.
READY is build metadata, not anonymous page, live account or database proof.
The 12 selected native inputs and pre-existing untracked review stayed byte-exact.

## Original outcomes

| Packet | GitHub run | Actual result |
| --- | --- | --- |
| Exact `pg@8.23.1` lock | 43472845152 | Passed; scripts disabled, no node_modules created; scratch/proof removed |
| First database fixture | 43474689996 | No tests reached; initializer's default socket unavailable |
| Environment socket correction | 43475703286 | No tests reached; official entrypoint explicitly clears PGHOST |
| Correct initializer/private sockets | 43476118444 | 29/30 actual cases passed; P13 lock observer failed |
| Independent P13 observer, C01–C10 | 43477185412 | P13 and ten client cases passed; browser filter found no tests |
| Four UI titles, corrected full-title filter | 43477638892 | U01/U03/U04 desktop and U02 narrow touch-emulated Chromium passed once |

All original ZIPs and job logs are retained under [cloud-workspaces/](cloud-workspaces/).
`verify-results.py` reads those bytes, hashes, complete source vectors and
original TAP outcomes without executing the product or tests. It verifies 30
distinct API/database identities across the original and corrected runs, not
one all-green 30-case run. Fourteen protected implementation files are identical
between the original 29-case pass and the correction/UI source.

The corrected P13 owns its workspace independently and calls
`pg_stat_clear_snapshot()` while polling an actual lock held by its admin
connection. It then aborts the real `pg.Client` operation, verifies no accepted
receipt or revision change, and closes the owned connections. The prior P13
failure remains sealed. Other API/database cases were not replayed.

Real PostgreSQL 17.12 ran in a named/labeled networkless container with tmpfs
data and Unix sockets; all four database attempts verified container and
scratch absence. Auth API responses are authored fixtures. Checks establish
private schema/RLS, cross-account isolation, independent connection persistence,
concurrent revision conflicts, retry receipts, actual commit plus authored
response loss, rollback, deletion without content-bearing receipts, actor reset,
role admission and the 25-active-workspace limit. They do not establish hosted
TLS, live Supabase/Auth/SMTP or provider operational readiness.

The ten client cases accept callback scrubbing, fresh restore verification,
single-flight refresh, identity fencing, one uncertain write, exact pending
command retention, quota failure before mutation and receipt clearing. Four
Chromium UI cases subsequently passed on the exact same source: explicit
save/reload/reopen/delete, keeping newer edits during a delayed open, a lost
create response reconciled without another create, and account-switch upload
requiring explicit Save as new confirmation. U02 also checked horizontal fit
at 390×844 with touch emulation; no physical-device claim. The two screenshots
were inspected. Authored browser API responses are separate from real SQL proof.
No backend/client case was replayed for this UI run. Old 77/eight hosted/seven
native/fixture-retirement scopes stayed closed throughout.

There are 44 distinct focused passed identities, across the recorded runs.
The verifier checks the exact four browser identities/projects, one attempt
each, zero skipped/unexpected/flaky/global errors, complete source guards,
original artifact streams and process/scratch cleanup. The five temporary
workflow definitions are disabled and all exact QA refs are absent. Retained
Vercel previews are not claimed deleted; the connected tool has no deletion
capability. The source work branch is retained for the real release work.

## Remaining release boundary

Live storage/Auth configuration, a supported CLI-generated migration, dedicated
runtime credential custody, callback/email delivery and hosted user journeys
remain required. The installed CLI's local telemetry write was denied; no
permission workaround was attempted. SQL bootstrap is a fresh-install candidate,
not a migration already applied. No paid service, new user account, model call
or production data is part of this packet.
