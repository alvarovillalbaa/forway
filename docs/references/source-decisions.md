# Sources and initial product decisions

29 October 2026. The brief was read in full from the connector's dated snapshot;
the following public primary sources were also inspected. No external service
was connected and no account/plan was created.

- [Omnia workflows](https://www.useomnia.com/use-cases) connects page audits,
  cited-source analysis and content work. Forway follows that diagnosis-to-edit
  sequence as a product inference, without claiming Omnia feature parity.
- [Amplitude channels](https://www.amplitude.com/docs/data/channels) classifies
  traffic using referrer/UTM properties, including AI-assisted referrals.
  Referral traffic requires actual analytics evidence; it cannot be inferred
  from a page audit or pasted answer. No Amplitude metrics are invented here.
- [Google's generative-search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
  keeps useful content and technical SEO central, while making indexing/serving
  explicitly uncertain. Forway findings describe observed source signals;
  passing them does not promise search or AI-answer performance.
- [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
  informed destination/redirect validation and DNS binding review for the page
  importer. Source review and authored adapters do not establish hosted network
  isolation or comprehensive resistance to abuse.

These implementation choices fill in a very short brief. They do not select
paid monitoring, automatic AI querying, Search Console/Amplitude credentials,
recurring jobs or permissions to publish to customer websites. Those remain
separate integration decisions. The full product and portfolio goal stay open.
