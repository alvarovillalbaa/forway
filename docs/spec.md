# Forway product and delivery contract

29 October 2026. Source: [Forway in Notion](https://app.notion.com/p/408a1ee8bd068047ae66c199a930b339),
fetched/read in full from the connector snapshot dated 29 October 07:42 UTC.
The complete brief says: create SEO/GEO, analyze SEO/GEO, improve SEO/GEO,
and consider platforms such as Omnia and Amplitude. It does not select an AI
provider, billing plan, analytics account or customer website write access.

## Intended workflow

1. Analyze an actual public page URL, or supplied HTML when the page cannot be
   fetched. Inspect source metadata, headings, links, image descriptions,
   structured data and answer/source structure. Keep observations distinct
   from unmeasured rendering, indexing, traffic and answer-engine visibility.
2. Create and edit a page draft: title, description, canonical URL, heading,
   summary, body, factual Q&A and source links. Produce escaped HTML/metadata
   artifacts the owner can review, then re-audit that generated page.
3. Improve an imported draft with concrete findings and compare the same checks
   before/after. Never overwrite the remote website or promise ranking gains.
4. Analyze supplied AI-answer observations with their engine, prompt and time:
   brand/competitor mentions and explicit cited URLs. Report denominators and
   retain the original evidence; page heuristics cannot stand in for this data.
5. Export/import the actual workspace explicitly, without fabricated campaigns,
   prompts, traffic, provider answers, customers or historical trends.

The first workflow is an implementation choice derived from the short brief,
not a claim that Notion specified every field. The complete product goal stays
open for shared persistence, chosen integrations and verified hosted operation.
The portfolio's PostgreSQL/Supabase-hostable persistence direction is retained;
no schema, Auth policy or provider capacity workaround is approved here.

## Technical and proof boundaries

Native browser modules and a dependency-free Node public-page importer avoid
unrequested installations. Public-page fetching has strict destination,
redirect, byte and time limits. Analysis never executes imported HTML or site
scripts. Source checks do not establish rendered-page/Core Web Vitals evidence.

No model/provider call, analytics SDK, Search Console/Amplitude connection,
third-party site mutation, recurring monitoring or shared database is implied.
Those require concrete account/configuration and applicable approvals. Supplied
answers are evidence entered by the user, not fresh engine measurements.
Browser/backend execution requires its separately published focused proposal.
Source publication, tests and deployment must each be verified at their actual
scope before reporting completion. The full app/portfolio is not complete just
because this initial source exists.
