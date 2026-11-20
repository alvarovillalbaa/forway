# Forway

<!-- project-family:start -->
> **Project family:** [Web & Creative Apps](https://github.com/alvarovillalbaa#web-and-creative-apps) · **Area:** Content analysis
<!-- project-family:end -->

Last updated: 2026-11-16

Create, analyze and improve content for search and AI answers.

[Open Forway](https://forway.vercel.app) · [Delivery evidence](docs/results/2026/10-29/initial-delivery.md)

An editorial workbench for discovering allowed website pages, auditing source,
editing content drafts and comparing explicitly reviewed API answer cohorts.
Built from the [Forway brief](docs/spec.md) in Alvaro's personal Notion.

**Site analysis V2 — published:** the URL-first interface now discovers
same-host pages through robots, links and strict XML sitemaps, retaining explicit
batch limits, refusals and a resumable frontier. Reports show exact page
denominators, source-only agent signals, priorities and copyable prompts.
Reviewed OpenAI/Anthropic/Google API comparisons use each caller's own key and
exact model/query, retain native answers/usage/citations and separate failed or
uncertain calls from successful-answer denominators. Page/draft workspaces,
crawls and API comparisons have separate exports. All69 new T2 controls and six
native desktop/390px journeys passed together at `286a88d` with authored upstream
responses; see [the receipt](docs/results/2026/11-15/site-analysis-v2/result.md).
The owner then approved the concrete rollout. Release baf26140 / READY
dpl_9VJ16953ogc44gs6vkhMBkuwUx1q passes two actual public desktop/390px
journeys: owned-host crawl, exact downloaded source, keyboard/clipboard and
20served public assets/security headers before and after.85anonymous GETs and
six own-fixture crawl POSTs were observed; zero provider calls. Browser,
process/source/scratch guards pass and the new QA workflow/ref are retired.
Total V2 CI is183/1200seconds including the pre-job workflow rejection and
retirement. [Rollout originals and limits](docs/results/2026/11-16/site-analysis-v2-rollout/result.md).
No real model call or third-party website scan was executed.

**Initial workbench published and hosted.** Vercel reports READY and the served
index matches the initial source. The [77 Node fixture checks](docs/results/2026/11-04/local-node-checks.md)
passed once on 4 November at `14e7b44a6459602d1a5392eb313273d361db5fad`, using
existing Node 26.8.2. This is a new runtime profile; the historical Node 24.21.0
preparation was not executed. The separate [eight hosted browser workflows](docs/results/2026/11-05/hosted-browser-checks.md)
passed once on 5 November at `faba72499adb675bbbef50a01e5c11ecda6f50c2`:
two real own-fixture API imports, browser parsing, actual downloads/recovery,
cohort separation, controlled races and narrow keyboard/overflow checks.
Arbitrary-site safety, physical devices and full-product acceptance remain open.
No account, analytics integration, AI provider or shared database is configured.

The [seven native transport identities](docs/results/2026/11-13/native-network.md)
passed once on13November at ce59d9b1: actual DNS, selected socket/TLS peer,
redirects, response refusals and streaming cancellation against authored
own-host fixtures. The temporary public fixture is removed from the API after
qualification. Earlier fixture/browser scopes remain separate; general
Internet safety and shared persistence are still open.

## Workflow

- **Audit** a public page URL, or import/paste its HTML. Findings describe source
  metadata, structure and answer/source signals. They do not measure indexing,
  rendered performance, rankings or answer-engine visibility.
- **Discover website pages** on one exact hostname. Robots uncertainty stops
  discovery; batch limits retain pending URLs. Export captured HTML/frontier and
  reopen without network access; Resume checks policies again. An exhausted
  discoverable frontier does not establish every page on a domain.
- **Act on the report**: inspect SEO/answer/agent source check counts, review
  intent-dependent findings and copy a concrete implementation prompt. Tasks
  keep affected URLs and observations. A Markdown report can be downloaded;
  untrusted supplied answers are inside literal fenced blocks.
- **Create and improve** a content draft with metadata, a direct answer,
  body text, Q&A and citations. Export escaped HTML or a head snippet; compare
  the generated page against the source audit. Changes never write to a site.
- **Analyze evidence** collected from an AI engine: keep its prompt, engine,
  time and original answer alongside observed mentions and cited URLs. Counts
  use the supplied answer denominator for the selected brand/domain/competitor
  cohort; separate cohorts are never blended into a visibility metric.
- **Compare API answers** only after reviewing up to5 queries ×3 chosen models.
  Keys stay out of URLs/storage/exports; no server key is consumed. Unknown
  acceptance is never automatically retried. API answers with no web tool are
  distinct from consumer ChatGPT/Claude/Gemini or Google AI Overview visibility.
- **Keep your work** through explicit workspace export/import, including
  incomplete drafts. Working state is in memory; no shared persistence or
  background synchronization is implied.

## Source

- `public/`: dependency-free browser application and pure content/evidence logic.
- `api/audit.mjs`: public-page import request boundary for a Node Vercel function.
- `api/crawl.mjs`: fixed page/robots/sitemap document profiles sharing the public
  validated/pinned fetcher. `public/src/crawl.mjs` owns serial discovery/state.
- `api/answer.mjs` and `src/provider-answer.mjs`: bounded same-origin JSON input,
  fixed official provider targets and exact answer/usage/citation projection.
- `src/fetch-page.mjs`: validated, pinned, bounded public HTTP(S) retrieval.
- `tests/unit/`: 77 passing authored fixture cases under the
  [six-file and browser scope](docs/proposals/focused-checks.md). The
  [JSON receipt](docs/results/2026/11-04/local-node-checks.json) preserves raw TAP,
  source guards, cleanup and the collector's extra ordering-check qualification;
  all exact names/statuses matched, and no rerun occurred.
- [Architecture](docs/architecture.md) and [source decisions](docs/references/source-decisions.md).

Node 22+; no dependency installation or frontend build is required.

```sh
node scripts/check.mjs
git diff --check
```

The checker parses modules, resolves imports/assets and checks documents/JSON.
It never imports product functions or runs tests, a server or browser. Live
URL import additionally needs the deployed same-origin API; a static file
server alone does not provide it. V2's bounded owned-host/public rollout is
accepted. Broader public/provider acceptance, hosted operational controls and
shared PostgreSQL/Supabase persistence remain separate gates. Deployed source
sets audit/crawl10seconds and answer35seconds, preserving the provider25second
and handler30second bounds. The independent work/private-workspaces branch
remains intact; it was not merged or silently used as production evidence.

The earlier Node status edition changed three documents among its 30 inputs,
leaving 27 unchanged. The later browser packet adds isolated acceptance tooling
and records its own source/profile; no application/API module or dependency was
changed. Historical seals and raw evidence stay pinned to their original sources.
Reproduce the appropriate checked commit rather than relabeling this later
documentation publication as another execution.

MIT licensed. No model/provider call, paid plan or new account was used.
