# Implementation Report: Organic Search & AI Discovery Engine

- **Date:** 2026-11-21
- **Repository:** `idrisp1/build-with-idris-site`
- **Baseline:** tag `pre-seo-engine-2026-11-21` (= `177d3af`). Full backup at `C:\Users\quien\Downloads\buildwithidris_backups\2026-11-21_pre-seo-engine\`.
- **Deployment status at the time of writing:** **built and tested locally, not yet deployed.** Every production claim below is marked accordingly.

---

## 1. What was discovered
See `initial_website_audit.md` for detail. In short:
- A single-page portfolio (`index.html` + Express) with JSON-file storage on a Railway volume, an in-place admin editor, and a read-only Search Console panel.
- Real content only appeared after JavaScript ran: about **296 words** in the raw HTML. Most AI search crawlers saw an almost empty page.
- One URL for 7 agency services, about 10 engineering capabilities and 7 projects.
- There were no analytics, no Bing setup, no IndexNow, no stored history and no scheduler.

## 2. Services identified (verified only)
- **Agency, explicitly offered** (performed by your local app at `C:\Users\quien\Downloads\Ads Campaign`, read but not touched): Digital Marketing & Advertising; Website Design & Development; SEO & Online Visibility; AI-Powered Data Annotation & Evaluation; Document Processing & Data Management; Business Research & Intelligence; Business Process Automation & AI Solutions.
- **Engineering, backed by projects and experience:** custom software and backends (incl. HIPAA, serverless AWS), AI and LLM development (chatbots, agents, fine-tuning, MLOps).
- **Deliberately not promoted:** the forex bot (your own startup), WordPress, Shopify, mobile apps, social-media management, pricing. None of these are evidenced on the site.

## 3. Existing functionality preserved
All of the following is verified by tests (`automated_testing_report.md` §A) and browser checks:
- Homepage sections, nav anchors and design.
- Developer Login, in-place editing of all 12 content keys, project CRUD, uploads, SSE live sync.
- Contact form, admin inbox, visitor reviews with moderation, floating promo video.
- The Search Insights (GSC) panel.
- Share cards (Open Graph) and the GSC verification tag.
- `/health`, rate limiting, helmet headers, CORS.
- References keep their contact details (your decision).

## 4. Technical SEO improvements implemented
| Change | File(s) |
|---|---|
| Server-side prerender of the full homepage content. Client JS renders identical markup on top (no visual change). Raw HTML went from 296 to **2,021 words**. | `backend/seo_engine/render/home.js`, `index.html` |
| Dynamic `<title>`/description; consistent name **Idris Paul Kwaya** everywhere | `home.js`, `index.html` |
| One linked JSON-LD `@graph` (WebSite, Person, ProfessionalService + OfferCatalog, Service, FAQPage, BreadcrumbList, CreativeWork, Article). No ratings or prices. | `render/schema.js` |
| `www` → apex 301 (production); `/index.html` → `/` 301 | `seo_engine/index.js` |
| Sitemap of all indexable pages with real `lastmod` from content-hash tracking | `render/discovery.js` |
| robots.txt: search and AI-search crawlers allowed, training crawlers blocked | `render/discovery.js` |
| `/llms.txt` | `render/discovery.js` |
| Branded HTML 404 page with real 404 status and `noindex` | `render/pages.js` |
| Accessibility: review-form labels, ARIA role on the resize handle (Lighthouse a11y 89 → 98 locally) | `index.html` |
| Admin UI excluded from snippets (`data-nosnippet`) | `index.html` |

## 5. Keyword universe
- `keyword_research/keyword_universe.md` and `keyword_research/keyword_data.json`: 106 keywords in categories A–K, a reproducible scoring model, and a status for each keyword (70 served by new pages, 20 article opportunities, 7 requiring evidence, 5 not relevant, 2 consolidated, 2 existing).
- **No search volumes were invented.** Demand is an explicitly labelled estimate until the keyword agent replaces it with measured GSC and Bing data.
- `keyword_research/keyword_coverage_network.md` covers Services × Locations × Intents × Problems, plus the page architecture.

## 6. Pages created and improved
- **New commercial pages: 8** (1 hub + 7 services).
- **New evidence pages: 7 project case studies.** 6 are indexable; *Dawn Podcast FM TV* is `noindex` until its description is longer, and is fixed automatically when you expand it in admin.
- **Existing pages improved: 1.** The homepage (prerender, metadata, schema, links).
- **Articles: none generated, by design.** Owner decision (2026-11-21): **no LLM, deterministic only**. When real search data shows demand for a topic, the content agent saves a **research brief** in the admin panel (query, demand, existing coverage, site facts to use, related projects, suggested outline) for you to write from if you choose. The `/insights` section stays hidden until an article exists.
- **Navigation:** exactly **one** new header link (Services), as you approved. Footer and contextual links do the rest.

### Why each commercial page is justified
| Page | Verified service | Distinct intent / buyer | Proof on page |
|---|---|---|---|
| `/services` | All | Comparing what's offered | Routes to each service |
| `/services/website-design-development` | Agency: Website Design & Development | Small business needs a site, booking or a store ("website design Phoenix") | Peggy, Bokeh, CareScrubs, JEZZOB; CareScrubs experience bullets |
| `/services/custom-software-development` | Freelance engineering | Needs an application, API or backend, often compliance-sensitive | JEZZOB, Cadens, Dawn, CareScrubs; JEZZOB and freelance bullets |
| `/services/ai-development` | AI Systems (engineering) | Technical buyer hiring an AI engineer (chatbot, LLM features, fine-tuning) | MTN; 3 AI-system walkthrough videos; MTN bullets |
| `/services/ai-automation` | Agency: Business Process Automation & AI Solutions | Business owner wants hours back ("automate repetitive tasks") | Cadens, MTN |
| `/services/seo-digital-marketing` | Agency: SEO + Digital Marketing + Business Research (consolidated) | Local business wants to be found and measured | This site's own monitoring system (no client results claimed) |
| `/services/document-processing` | Agency: Document Processing & Data Management | Back-office buyer with PDFs and invoices to digitize | Service description only; no projects claimed |
| `/services/ai-data-annotation` | Agency: AI-Powered Data Annotation & Evaluation | ML team needs labelled data or evaluation | AI-systems videos as relevant expertise; no client claims |

Merged rather than split: e-commerce, redesign and maintenance (into the website page); paid ads and business research (into SEO & marketing); chatbots, agents and fine-tuning (into AI development). Rejected: city pages (a doorway-page risk), and unverified platforms.

## 7. 200-post social plan
`social media posting/social_media_post_ideas.md`: **exactly 200** posts (Day 001 = the Phoenix website post), spread over LinkedIn 48, Instagram 40, Facebook 39, TikTok 27, YouTube 25 and Reddit 21. Every post has a complete caption, hashtags, a creative suggestion and a UTM-tagged link. An automated check confirms the count, completeness, uniqueness, that links resolve, and that every figure exists in the site's evidence. Nothing is auto-published.

## 8. AI search optimizations
See `ai_search_optimization.md`: crawler policy, AI-readable HTML, a page per service to cite, linked entity schema, `llms.txt`, AI referral and crawler measurement, and conversion attribution.

## 9. Integration status
| Integration | Status | Detail |
|---|---|---|
| **Google Search Console** | **Implemented, awaiting production verification** | Uses your existing service account. Daily sync of page × query, device and country into history; weekly URL Inspection of every page; sitemap list and status. **Sitemap submission** needs the service account to have **Full** permission; with Restricted it gets 403, which is reported in the panel instead of retried. Unverified until deployed, because the credentials exist only on Railway. |
| **Bing Webmaster Tools** | **Implemented, awaiting authorization** | JSON API (SOAP/POX retire 2026-08-31, so they're not used): page, query, crawl issues, quota, feeds, sitemap submission, and related-keyword research. Needs `BING_WEBMASTER_API_KEY`. |
| **IndexNow** | **Implemented and tested against a mock; awaiting production verification** | Key auto-generated and served at `/<key>.txt`. Change-driven submissions only, with retry and backoff, a persistent queue, a rate floor, and honest outcomes ("received", never "indexed"). Enabled automatically in production. |
| **Content agent** | **Implemented and tested; deterministic (no LLM, no API key, no cost)** | Title experiments built from your own verified keywords and real search queries, plus research briefs. The Claude integration and `@anthropic-ai/sdk` were removed at your request. |
| **Competitor gap analysis** | **Implemented, optional** | Needs you to list competitor homepages in `SEO_COMPETITOR_URLS`. Competitors are never guessed. |
| **Google Business Profile** | **Not touched** (Phase 5 skipped as instructed) | — |

## 10. Automation architecture
```
Railway (always on, restartPolicy ON_FAILURE)
└─ node backend/server.js  (existing Express app)
   ├─ existing routes (content API, admin, uploads, messages, reviews, Search Insights)
   └─ backend/seo_engine/
      ├─ render/        prerendered home, services, projects, insights, 404, sitemap, robots, llms
      ├─ analytics.js   cookie-less referral, crawler and conversion counts
      ├─ integrations/  gsc, bing, indexnow, http (retry, backoff, redaction)
      ├─ agents/        technicalAuditor, performanceAnalyzer, keywordIntelligence,
      │                 contentOptimizer (deterministic titles + research briefs), competitorAnalysis, qualityGate
      ├─ pages.js       versioned page store (never deletes; rollback = new version)
      ├─ learning.js    change ledger, experiments, outcome stats -> change-type weights
      └─ scheduler.js   persistent jobs: lock, timeout, backoff, alerts, catch-up
Data: backend/data/seo/ on the existing Railway volume (next to content.json)
```
- **No new infrastructure.** It runs in the existing service and uses the existing volume, with no new database.
- **Independent of your computer.** It runs on Railway. The scheduler is on by default when `NODE_ENV=production` and off locally.
- **Requirement on Railway:** the service must stay always-on (App Sleeping / "Serverless" **disabled**) and run as **1 replica**. File locks also protect against overlapping deploys.

### Scheduled jobs
| Job | Frequency | Needs |
|---|---|---|
| url-state: detect page changes → sitemap `lastmod` → IndexNow | every 30 min | — |
| sitemap-submit: GSC + Bing, only when the URL set changes | daily | GSC and/or Bing |
| gsc-sync: daily performance history (backfills 90 days, 30 per run) | daily | GSC |
| gsc-inspection: real indexing status per URL | weekly | GSC |
| bing-sync: page/query stats, crawl issues, quota | daily | Bing key |
| performance-analysis: low CTR, decliners, risers, striking distance, cannibalization, coverage gaps, not-indexed | daily | GSC data |
| keyword-intelligence: merge real queries; measured demand | weekly | GSC/Bing data |
| technical-audit: self-crawl; external links weekly | daily | — |
| experiment-evaluation: keep winners, roll back losers | daily | GSC data |
| content-agent: one deterministic title experiment + up to 3 research briefs per run | weekly | GSC/Bing data |
| competitor-analysis | monthly | `SEO_COMPETITOR_URLS` |
| weekly-report | weekly | — |

## 11. Historical learning
- **Stored permanently:** daily GSC rows, Bing snapshots, URL Inspection history, performance snapshots, the change ledger (before/after/reason/author), every page version, experiments with baseline/post/verdict, the IndexNow submission log, technical-audit history, research briefs and the research-opportunity log, job runs and alerts.
- **Experiments** change one variable (the title). They're evaluated after a 4-day recrawl grace period plus a 28-day window, using a two-proportion z-test with a minimum of 200 impressions per window, and marked *confounded* if the average position moved by more than 2. Losers are rolled back automatically.
- **Learning loop:** after 5 or more concluded trials of a change type, the agent down-weights types that rarely help (and pauses them) and favours types that do. The agent can't modify its own code or safety rules. Learning only adjusts data and configuration.

## 12. Tests performed
**63/63 automated tests pass** (`automated_testing_report.md`), plus visual regression screenshots, a real-browser admin flow, and a Lighthouse A/B.

**Known trade-off:** homepage LCP was about 0.5 s slower in the local A/B because the HTML now carries the content (TBT and CLS improved). It must be re-measured on production after deploy.

## 13. Status summary
| Status | Items |
|---|---|
| **Fully implemented and tested (locally)** | Prerendering; new pages; schema; sitemap, robots and llms; redirects; 404; analytics and attribution; versioning and rollback; scheduler; quality gate; experiment statistics; performance and keyword analysis logic; IndexNow client (mock); Bing client (mock); 200-post document; admin SEO panel |
| **Implemented, awaiting authorization** | Bing data (API key), competitor analysis (your list) |
| **Implemented, awaiting deployment to verify** | All production behaviour; GSC jobs with the real service account; real IndexNow submissions; www redirect on the real domain |
| **Partially implemented** | Heading-order a11y item left as is (changing it would alter the design). "Improve existing content" by the agent is limited to page titles (deterministic, tested by experiment). Body copy changes only through reviewed code, and new articles are briefs for you to write. |
| **Not implemented** | Automatic social posting (needs platform API approval per platform; not requested to automate); Google Business Profile (skipped by instruction); keyword-volume data from paid tools (none connected; estimates are labelled) |
| **Unable to verify** | Whether the site is currently indexed (needs GSC, which only runs in production); Core Web Vitals field data (too little traffic for CrUX) |

---

## 14. One-time setup checklist

| # | What | Why | Where / how | Env var | How it's verified | Renewal |
|---|---|---|---|---|---|---|
| 1 | **Deploy** this commit | Nothing above is live until it is | Push `main` to GitHub; Railway auto-deploys (or "Deploy" in the Railway dashboard) | — | Visit `https://buildwithidris.com/services` → 200; Developer Login → **SEO Engine** shows the jobs | — |
| 2 | **Keep Railway always-on, 1 replica** | The scheduler runs inside the server | Railway → service → Settings: App Sleeping / Serverless **off**; Replicas **1** | — | The SEO Engine panel shows `url-state` running every 30 min | — |
| 3 | **GSC: give the service account Full permission** (optional but recommended) | Lets the engine submit the sitemap; reads already work | Search Console → Settings → Users and permissions → the service account email → change Restricted to **Full** | (existing `GSC_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL`) | Panel: `sitemap-submit` job result `google.ok: true` | Permanent |
| 4 | **Bing Webmaster Tools** | Bing data and Copilot visibility | bing.com/webmasters → **Import from Google Search Console** (verifies instantly), then Settings → **API access** → Generate API key | `BING_WEBMASTER_API_KEY` | Panel: Bing shows "configured"; the `bing-sync` job → `ok` | The key doesn't expire; regenerate if leaked |
| 5 | **Competitors** (optional) | Content-gap analysis | Choose 3–5 competitor homepages yourself | `SEO_COMPETITOR_URLS` | `competitor-analysis` job → `ok` | Update when competitors change |
| 6 | **Validate structured data once live** | Confirms the schema on public URLs | search.google.com/test/rich-results and validator.schema.org with `https://buildwithidris.com/` and one service page | — | No errors reported | — |
| 7 | **Ask client sites for a credit link** (optional, manual) | Legitimate prominence signal | Ask Peggy's, Bokeh, CareScrubs, JEZZOB and Cadens to add "Website by Idris Paul Kwaya" linking to the matching case study | — | — | — |
| 8 | **Social accounts** | Posting the 200-post plan | Post manually from `social media posting/social_media_post_ideas.md`. Automatic posting would need each platform's API app approval. | — | UTM visits appear in SEO Engine → Traffic | — |

**How to enter credentials securely:** Railway dashboard → service → **Variables** → New Variable. Paste the value there only. Never commit it, never put it in `index.html`, and don't paste keys into chat. The engine reads keys only from the environment, redacts them from every log and error, and never returns them from any endpoint (tested).

## 15. Operating instructions
- **See what it's doing:** Developer Login → **SEO Engine**. It shows integrations, every job's last and next run with errors, traffic by source (including AI assistants), crawler visits, pages and overrides with **Roll back** / **Unpublish** buttons, and recent changes with reasons.
- **Run a job now:** the "Run now" button on any job.
- **Read research briefs:** SEO Engine panel → "Research briefs", or `GET /api/admin/seo/briefs`. **Stop everything:** set `SEO_SCHEDULER_ENABLED=false`.
- **Undo a change:** Roll back in the panel, or `POST /api/admin/seo/pages/:id/rollback {version}`.
- **Roll back the whole release:** redeploy commit `177d3af` in Railway (or `git revert` this commit). `backend/data/seo/` can stay; the old code ignores it.
- **Run tests:** `cd backend && npm test`.
