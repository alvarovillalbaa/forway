# Standalone HTTPS and PostgreSQL

This candidate adds a standalone Node HTTPS entry point for the same workbench
and API handlers used on Vercel. Seven real local-service identities, including
desktop and narrow UI save/reopen, passed across the original qualified runs;
see [results and original failures](results/2026/11-13/self-hosting.md). The
earlier 44 focused fixture checks stay separate. This does not establish a
live cloud release, native database TLS or real email delivery. Qualification
uses explicit local fixture TLS terminators and a task CA.

Use Node 22 or newer and the existing exact dependency lock:

```sh
npm ci --ignore-scripts --no-audit --no-fund
cp .env.example .env.local
```

Fill `.env.local` privately with the values in
[the workspace contract](cloud-workspaces.md). Add your HTTPS certificate and
key file paths as `FORWAY_TLS_CERT_FILE` and `FORWAY_TLS_KEY_FILE`. The files
stay outside version control. Set `FORWAY_APP_ORIGIN` to the actual HTTPS URL,
including its listening port. The server binds loopback by default; use
`FORWAY_BIND_HOST=0.0.0.0` only for an intentional container/public listener.
The key is never sent to the browser or printed by the startup command.

```sh
npm run start:local
```

`npm start` instead uses the environment supplied by your service manager.
No `.env` is loaded implicitly by that command. The standalone server does
not install software, change the database, create accounts or enable email.
It serves only regular files resolving inside `public/` and applies the same
declared security headers. API bodies, actor verification, PostgreSQL TLS,
private role admission, revisions and retry receipts retain the existing
handlers. No HTTP fallback or certificate-validation disable is added.

Use a trusted HTTPS certificate for the app and Auth endpoint. PostgreSQL must
offer TLS with a certificate trusted by Node, optionally through the inline
`FORWAY_DATABASE_CA`. Do not pass SSL overrides in the connection URL. The app
connection must authenticate as the dedicated `forway_runtime` role; never
give it the installer/admin password or a Supabase privileged key.

Database installation is a separate explicit operator action against a
reviewed empty namespace. The official pinned Supabase CLI generated
`supabase/migrations/20261113191844_private_workspaces.sql`; its unchanged SQL
was applied to a fresh local PostgreSQL 17.11 stack and the schema/history/RLS
read back in run `43490714393`. Use the generated migration with the CLI, or
the byte-identical `db/bootstrap.sql` in a reviewed manual installation; choose
one route. Do not apply both or take over an existing role/schema. There is no
runtime auto-migration. A running installation still needs a private login
password for `forway_runtime`, an operator-supplied trusted TLS endpoint and
the real Auth settings described in the workspace contract.

Shutdown stops accepting connections and allows current requests to finish.
After ten seconds it closes the server's own remaining sockets, including
unfinished TLS handshakes. It does not manage or stop PostgreSQL/Supabase.
Source files must be trusted, and the service manager still owns certificate
renewal, restart policy, resource limits and operational retention.

Forway's Vercel environment metadata lookup returned 403 on 13 November; its
mapped CLI fallback was not installed. No environment retry, database resume,
project creation or provider substitution was made. Hosted binding and email
delivery remain separate. Read
[the local qualification scope](proposals/local-supabase-checks.md) for the
actual acceptance boundary, including the prior packets that stay closed.
