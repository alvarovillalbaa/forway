# Private account workspaces candidate

This work branch adds the server foundation for private shared workspaces.
The current production workbench remains the accepted memory/export release.
The candidate includes browser integration; it still needs focused UI proof
and live storage/Auth setup before a working shared release can be claimed.

`POST /api/workspaces` accepts only list, get, create, save, delete and operation
lookup. Every request verifies its bearer with the fixed Supabase `/auth/v1/user`
endpoint, accepts only confirmed nonanonymous users, and derives owner ID from
that response. User metadata and caller ownership fields never grant access.
The endpoint passes canonical version-1 workspace validation before any SQL.

The installer owns `forway_private`; a dedicated `forway_runtime` role has no
DDL, bypass, superuser or inherited memberships. Forced RLS and explicit owner
predicates use a transaction-local actor. Only the server holds its connection.
The schema is not exposed through PostgREST; no browser SQL/RPC grants or
security-definer functions are installed. `db/bootstrap.sql` deliberately
refuses existing namespace/role collisions. It has not been applied live and
is not yet a CLI-generated migration. Inspect the target and generate a proper
migration with `supabase migration new private_workspaces` before provisioning.

Saves/deletes require a revision. Concurrent edits return a conflict rather
than overwriting another version. Each write requires an operation UUID;
identical retries return the original metadata receipt. Reusing the UUID for
another payload conflicts. Receipt and content change commit atomically.
After transport or commit uncertainty, keep the same payload/UUID and query
its receipt; an absent receipt does not prove no request is still in flight.
Never automatically issue a new write UUID. A receipt does not mean the current
local draft is saved if the user edited it after taking the request snapshot.

Deletion clears title, workspace text and content hash and leaves only an
ID/revision tombstone. Existing operation receipts retain no title or content.
Backup retention is a provider policy and is not a promise of immediate backup
erasure. Accounts have at most 25 active workspaces; deleting releases a slot.
Receipts/tombstones need an operational retention/capacity policy before public
scale, independently of the active-workspace count.

Server configuration (never enter credentials into a workspace):

- `FORWAY_APP_ORIGIN`: the one HTTPS app origin.
- `FORWAY_SUPABASE_URL`: fixed HTTPS Auth project origin.
- `FORWAY_SUPABASE_PUBLISHABLE_KEY`: a new `sb_publishable_` key only.
- `FORWAY_DATABASE_URL`: dedicated runtime role connection; no URL query or
  SSL file options. The actual database role must be `forway_runtime`.
- `FORWAY_DATABASE_CA`: optional inline trusted CA, with certificate validation
  always enabled. Do not use `rejectUnauthorized:false` for hosted access.
- `FORWAY_EMAIL_ENABLED`: absent/false until email delivery, confirmed signup,
  recovery callbacks, rate limits and the exact authorized redirect are verified.

`/api/cloud-config` exposes availability flags only. The same-origin Auth proxy
has a fixed action vocabulary; no admin API, arbitrary upstream path, redirect,
user metadata or query is accepted. No cookies or cross-origin browser access.
Account tokens remain tab-scoped, separate from workspace exports. Callbacks
are removed from the URL before workbench hash navigation and verified through
the server. Sign-out fences late responses; fresh session refresh is shared
within the tab. Opening saved content checks the local revision before applying
it. A retained ambiguous command blocks new writes until reconciled using its
original ID and snapshot. Another account cannot silently upload the old
account's workspace: an explicit Save as new confirmation is required.

New proof scope: [30 disposable checks](proposals/cloud-workspace-checks.md).
Auth uses authored HTTP fixtures there; a pass cannot establish live SMTP,
Supabase delivery, production TLS or completed product behavior.
