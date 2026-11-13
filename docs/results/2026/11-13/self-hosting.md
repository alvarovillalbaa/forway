# Standalone HTTPS and real local services

Seven distinct real-service identities R01-R07 are qualified across two
original runs: R01-R06 at `46477887d9a1258f7d10cd0093235c8b71ae27c1`, then
R07 alone at `b2f2aa6457dfafe30217249819cbd3205a534af9`. This is not a single
all-green seven-case run. No Auth/workspace response was mocked. The earlier
44 workspace and 77/eight/seven importer packets stayed closed.

The candidate adds `scripts/serve.mjs`, explicit `npm start`/`start:local`, a
blank `.env.example`, the actual CLI-generated migration and a
[self-hosting guide](../../../self-hosting.md). The server runs the same static
workbench and fixed API handlers, requires HTTPS, and never installs software,
migrates, creates users or manages a database at startup. Shutdown drains and
then closes only its own remaining sockets. The exact existing pg lock remains
unchanged. Main/production remain the earlier memory/export release.

## Original outcomes

| Original run | Checked source | Result |
| --- | --- | --- |
| [43490714393](https://github.com/alvarovillalbaa/forway/actions/runs/43490714393) | `b59e1cbb` | Prerequisite passed: modern publishable key, real migration/history/schema/RLS and owned teardown. |
| [43492107411](https://github.com/alvarovillalbaa/forway/actions/runs/43492107411) | `51590575` | First TLS-setting command exited1 before app/browser execution. Exact private database error was not exported. Docker teardown passed; a protected-process scan caused cleanup PermissionError, leaving scratch removal unverified. |
| [43493427358](https://github.com/alvarovillalbaa/forway/actions/runs/43493427358) | `2d57e158` | R01-R05 observed passed, then R06 timed out on an omitted source confirmation. Resources/scratch retired; final source guard failed without its path diagnostic. Whole profile false. |
| [43494538325](https://github.com/alvarovillalbaa/forway/actions/runs/43494538325) | `252b0991` | Before app/browser, source diagnostic found checkout-relative `supabase/.temp/`. Owned Docker/scratch removed; checkout cache retirement and final clean source were not established. |
| [43495299173](https://github.com/alvarovillalbaa/forway/actions/runs/43495299173) | `46477887` | R01-R06 passed with clean source/full-vector and process/resource/scratch guards. R07 saved but waited for a topbar label hidden by existing narrow CSS. Overall run false. |
| [43496339332](https://github.com/alvarovillalbaa/forway/actions/runs/43496339332) | `b2f2aa64` | R07 alone passed, observing the visible save notice. No R01-R06 replay. Source and all owned cleanup guards passed. |

The corrections affected the fixture: fixed local TLS termination, captured
own process identities, the existing source confirmation, child cwd isolated
in scratch, and visible mobile feedback. They did not weaken application TLS,
role admission, RLS, source guards or responsive styling. Preserve the false
originals; later success does not turn their missing observations into passes.

## Qualified behavior and limits

R01 verifies a real confirmed local user through GoTrue. R02 creates a real
PostgreSQL workspace and replays the same operation receipt. R03 reopens its
exact content after the actual standalone Node process stops and restarts.
R04 signs in a second real user, sees an empty own list and receives404 for
the first user's workspace. R05 checks stale revision409, a successful update,
and deletion/not-found. R06 and R07 use actual Chromium UI sign-in, authored
HTML confirmation, explicit save, reload/session verification, reopen, delete
confirmation and sign-out at1440×1000 and390×844. Both record zero page errors;
the narrow case records no horizontal overflow and uses touch emulation, not a
physical device. No route interception or synthetic backend reply is involved.

The admitted runtime was Node22.23.4, Supabase CLI3.1.0, local PostgreSQL17.11,
pg8.23.1 and Playwright1.61.1. The official CLI archive digest, exact source
vectors, dependency-tool lock, command exits and output-length/hash seals are
preserved. Raw private status/Auth/database streams, passwords, tokens and
private keys were not published. This is not a whole-network attestation.

The CLI generated `20261113191844_private_workspaces.sql`; its4363bytes match
`db/bootstrap.sql`, SHA-256
`ad47ce9c53dbf0c9de177d83a4bd9da60c966351feb08bc132b855acd117a59c`.
Actual migration history and forced RLS passed; anon/authenticated have no
private-schema usage. A disposable private role login is configured outside
the migration. The app gets a modern publishable key and that restricted role;
only the fixture administrator gets the local admin key. No real email is sent.

TLS is explicitly fixture-scoped: Node verifies the task CA; Chromium trusts
only its leaf SPKI. Fixed loopback TLS terminators forward unchanged Auth and
PostgreSQL authentication/query bytes to actual CLI services. PostgreSQL's
native SSL setting remains off. This does not qualify native database TLS,
public certificates, hosted credentials, email delivery or production accounts.
The PostgreSQL terminator performs only standard
[SSLRequest negotiation](https://www.postgresql.org/docs/17/protocol-flow.html#PROTOCOL-FLOW-SSL)
using a [Node TLSSocket](https://nodejs.org/api/tls.html#new-tlstlssocketsocket-options).

The final narrow fixture has one erased workspace, zero active workspaces and
one cleared-content tombstone before its whole owned stack is removed. App
and Chromium groups, both relays, owned Docker resources and scratch were
verified stopped/absent. All six temporary workflows are disabled; all six
new QA refs are SHA-checked/deleted and absent. One historical5November QA
ref remains untouched. Historical unverified cleanup is not relabeled.

The Mac was kept at native `f9ec9a35`, preserving the existing2350-byte
untracked9November review, hash
`997b4da561ea02be8c66a9c7c692430bced7580c4089ce7e212750739e40431f`.
Its tracked diff check passed. Storage Guard measured3.4GiB free against34GiB
required; no local install, build, browser or database environment was created.

## Evidence and remaining work

[Original archives and index](self-hosting/artifacts.json),
[exact source vectors](self-hosting/qualified-sources.json), workflows, original
compressed logs and retirement receipts are in `self-hosting/` beside this
page. `python3 -B self-hosting/verify.py` reads those bytes only and validates
every original outcome without starting an app, test, browser or database.

Forway's first non-decrypting Vercel environment metadata lookup returned403;
the mapped Vercel CLI was absent. No unchanged retry or credentials/config
substitution occurred. The connected Clous organization exposed seven inactive
Supabase projects; none was resumed, created or modified. Hosted binding,
actual public TLS/Auth/email and provider/analytics integrations remain open.
This is a working qualified self-hosting candidate, not hosted full-product
acceptance. The standing all-work authorization covers this bounded source,
free CI and disposable authored-service scope; no paid enrollment or model
call was used.
