# Forway

Create, analyze and improve content for search and AI answers.

[Open Forway](https://forway.vercel.app) · [Delivery evidence](docs/results/2026/10-29/initial-delivery.md)

An editorial workbench for auditing a real page, editing a content draft,
exporting reviewed HTML/metadata and analyzing supplied answer evidence.
Built from the [Forway brief](docs/spec.md) in Alvaro's personal Notion.

**Initial workbench published and hosted.** Vercel reports READY and the served
index matches source. The 77 Node checks and eight browser scenarios remain
unexecuted, pending separate approval; functional acceptance is still open.
No account, analytics integration, AI provider or shared database is configured.

## Workflow

- **Audit** a public page URL, or import/paste its HTML. Findings describe source
  metadata, structure and answer/source signals. They do not measure indexing,
  rendered performance, rankings or answer-engine visibility.
- **Create and improve** a content draft with metadata, a direct answer,
  body text, Q&A and citations. Export escaped HTML or a head snippet; compare
  the generated page against the source audit. Changes never write to a site.
- **Analyze evidence** collected from an AI engine: keep its prompt, engine,
  time and original answer alongside observed mentions and cited URLs. Counts
  use the supplied answer denominator for the selected brand/domain/competitor
  cohort; separate cohorts are never blended into a visibility metric.
- **Keep your work** through explicit workspace export/import, including
  incomplete drafts. Working state is in memory; no shared persistence or
  background synchronization is implied.

## Source

- `public/`: dependency-free browser application and pure content/evidence logic.
- `api/audit.mjs`: public-page import request boundary for a Node Vercel function.
- `src/fetch-page.mjs`: validated, pinned, bounded public HTTP(S) page retrieval.
- `tests/unit/`: 77 authored focused cases; execution requires separate approval
  under the [six-file and browser scope](docs/proposals/focused-checks.md).
- [Architecture](docs/architecture.md) and [source decisions](docs/references/source-decisions.md).

Node 22+; no dependency installation or frontend build is required.

```sh
node scripts/check.mjs
git diff --check
```

The checker parses modules, resolves imports/assets and checks documents/JSON.
It never imports product functions or runs tests, a server or browser. Live
URL import additionally needs the deployed same-origin API; a static file
server alone does not provide it. Shared PostgreSQL/Supabase persistence and
chosen provider integrations remain part of the open full-product direction.

MIT licensed. No model/provider call, paid plan or new account was used.
