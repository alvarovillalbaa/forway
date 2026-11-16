# Forway V2 production rollout

Prepared 16 November 2026. Status: explicitly approved by the owner; execution
is authorized with the same concrete limits. See the owner authorization in
docs/results/2026/11-16/site-analysis-v2-rollout/authorization.md. The source V2
approval explicitly excluded product commits/merges, deployment and live-site
execution. This proposal requests those next steps; it does not reopen closed
fixture tests or authorize model calls.

## Exact reviewed result

Publish the existing V2 URL-first interface, same-host discovery, source report,
prioritized tasks/prompts and explicit caller-key provider comparison to
https://forway.vercel.app. Start from accepted inactive source
dc65e134bc0185a9c6f587455621c9022c9bf8b3, whose 48 application/check inputs
carry qualification from286a88dc32a4d3aca2cd1fb7deb582718d9c54b1:
69 T2 controls and six native authored-response cases,100 aggregate CI seconds.
Those are retained as exact-byte evidence, not rerun or promoted to live proof.

Only the deployment configuration changes: retain audit10seconds, set crawl10
and answer35. The provider deadline is25seconds inside the30second route;
35 gives that route room to return its own finite uncertainty result. The
complete proposed config is site-analysis-v2-rollout.vercel.json.example.
Current official duration configuration was inspected at
https://vercel.com/docs/functions/configuring-functions/duration.
No production function default or currently observed timeout is inferred.

The current canonical target was read independently of the newest preview:

| Identity | Observed value |
| --- | --- |
| Team | team_JpdIsOJgYNpX0ywVZ54Zdb7m / Clous Team |
| Project | prj_y86aQbsCfHiDJvY5tFiTFV5cTnFa / forway |
| Production/main | f9ec9a35c6f05e579d95fc155f430f2a56debbf1 |
| READY production | dpl_npEKBp5Cug6mKTBSYwqotwbbBHnW |
| Existing project runtime | Node26.x |
| Preserved independent branch | work/private-workspaces at ae1057e6cd5c4463b1c5933b467ab42ac18dfd4a |

The independent branch is10commits ahead of the same main, with a pg lock,
restricted SQL/Auth implementation,44 focused identities and seven real local
service identities across retained runs. It is not production. Preserve that
branch, its source/evidence, inactive hosted binding and existing preview.
This rollout does not merge, reset, delete or overwrite that separate work.
The production baseline already uses memory/explicit file export; V2 retains it.

## Requested execution

1. Prepare one release commit directly on the exact current main, using the
   accepted V2 tree plus the proposed duration config and rollout evidence.
   Compare all48 protected inputs/blobs/modes and all20 public files. Assert no
   temporary workflow or QA-only deployment guard enters the product tree.
   Re-read main immediately before the final expected-head update; no force.
2. Before touching main, start owned public QA branch
   qa/forway-rollout-v2-20261116 with deployment disabled in that very first
   tree. Prepare pinned Node26.8.2, Playwright1.61.1/Chromium in nonce-owned
   runner scratch. Retain30GiB free plus2GiB estimated peak and verify source,
   imports/config and tool versions. No application install is required.
   The coordinator may update main only after the explicit preparation step
   succeeds; the live job then waits for the exact new served source.
3. Allow the existing Git integration to build and publish that main commit.
   Inspect actual READY production ID, commit, alias and Node version. Do not
   weaken preview protection or access an unrelated preview as public proof.
4. Run only the new hosted H01 desktop and H02 narrow keyboard identities in
   site-analysis-v2-hosted.mjs.example. They use actual anonymous HTTPS/DOM,
   source-byte/security-header comparisons before/after, real own-fixture
   discovery and source/prompt export. There are no mocked upstream replies.
   At most128 anonymous GETs and six same-origin /api/crawl POSTs, targeting
   only this app's /robots.txt, /sitemap.xml and existing authored-page.html.
   No Google/foreign link is fetched. No provider key or model request occurs.
5. Retain all original outputs/failures, exact deployment/source relation,
   normal browser/process closure and owned scratch removal. Retire only the
   new QA workflow/ref with expected-owner reads and independent404s. Preserve
   the dirty/unreadable Mac checkout and all its index/refs/untracked review.

Cap all new jobs including failures and retirement at1100seconds. With the
already used100, cumulative V2 CI remains1200seconds. Never borrow Umbral's
runner storage exception or install locally below the Mac reserve. A runner
refusal before publication leaves main unchanged. A changed failure can use
only the remaining aggregate budget; closed old cases are not replayed.

If the production build or actual hosted acceptance fails after publication,
the requested authority also covers returning traffic to the exact previously
READY production above, or a new revert commit of only this rollout. Record
the actual rollback mechanism and readbacks, including auto-assignment effects;
do not reset/rewrite unrelated main history or change protection/environment.

## Deliberately separate requirements

No account, migration, dependency, private-workspace/Auth setting, environment
secret, new hosting project/domain, paid plan, real model call, API-key creation,
shared persistence or arbitrary/public third-party scan is included. Reviewed
caller-owned keys remain an optional user action in the published interface.
This phase proves only the bounded owned-host crawl and actual hosted product
flow. Multi-provider live answers, broad-site behavior and durable/global abuse
control remain unproved; do not label this whole-portfolio completion.

## Preparation environment

The source checkout initially remained dirty on main with the existing source
and untracked9November review. Later reads began failing with OS
Operation not permitted; a metadata check still showed owner alvipe and mode755,
while git could no longer read its cwd. No chmod, permission workaround,
overwrite, install, build, test, browser or database was attempted. Preparation
continued using independently accessible GitHub/Vercel sources. The small
proposal staging directory contains only these review artifacts.

## Why this is a new authorization

The approved source proposal says: “No ... product commit/merge or deployment
is included.” Its scope also excludes live-site scans. The workspace
AGENTS.md section14 requires approval for CI/CD/deploy/production changes.
All previous named source/isolated permissions remain resolved; this question
is solely for the concrete production/owned-host phase above.
