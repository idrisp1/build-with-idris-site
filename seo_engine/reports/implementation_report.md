# Implementation Report: Organic Search & AI Discovery Engine

- **Date:** 2026-11-21
- **Repository:** `idrisp1/build-with-idris-site`
- **Baseline:** tag `pre-seo-engine-2026-11-21` (= `177d3af`). Full backup at `C:\Users\quien\Downloads\buildwithidris_backups\2026-11-21_pre-seo-engine\`.
- **Deployment status:** **deployed and verified on production** (latest commit on `main`). Each item below says how it was verified.

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
| Accessibility: review-form labels, ARIA role on the resize handle, heading order h2→h3 with identical computed styles (Lighthouse accessibility 89 → **100** on production) | `index.html`, `render/home.js` |
| LCP: the hero reveal starts right after the hero markup instead of at the end of the page (production LCP 2.1 s → median 1.6 s) | `index.html` |
| Admin UI excluded from snippets (`data-nosnippet`) | `index.html` |

## 5. Keyword universe
- `keyword_research/keyword_universe.md` and `keyword_research/keyword_data.json`: 106 keywords in categories A–K, a reproducible scoring model, and a status for each keyword (70 served by new pages, 20 article opportunities, 7 requiring evidence, 5 not relevant, 2 consolidated, 2 existing).
- **No search volumes were invented.** Demand is an explicitly labelled estimate until the keyword agent replaces it with measured GSC and Bing data.
- `keyword_research/keyword_coverage_network.md` covers Services × Locations × Intents × Problems, plus the page architecture.

## 6. Pages created and improved
- **New commercial pages: 8** (1 hub + 7 services).
- **New evidence pages: 7 project case studies.** 6 are indexable; *Dawn Podcast FM TV* is `noindex` until its description is longer, and is fixed automatically when you expand it in admin.
- **Existing pages improved: 1.** The homepage (prerender, metadata, schema, links).
- **Articles: written by you, published by the system.** Owner decision (2026-11-21): no AI writing. When real search data shows demand, the content agent saves a **research brief**. In Developer Login → SEO Engine, **"Write article from this brief"** (or **"+ Write a new article"**) opens the **article editor**, pre-filled with the suggested title, outline, service, related projects and the facts from your site you can use.
  - **Check:** shows exactly what would block publishing: prices, guarantees, superlatives, under 450 content words, a topic too close to an existing page, duplicate text, broken links, an unknown service. Any figure that isn't on your site needs an "I confirm these figures are true" tick.
  - **Publish:** puts it live at `/insights/<slug>` with Article schema, adds it to the insights index, the service page, the sitemap and `llms.txt`, and sends it to search engines immediately.
  - **Safety:** a failing publish never changes a live article; a new article is kept as a draft so your writing isn't lost. Every publish is a version you can roll back.
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

## 9. Integration status (verified on production, 2026-11-21)
| Integration | Status | Evidence |
|---|---|---|
| **Google Search Console** | **Live and verified** | Service account, read access. `gsc-sync` stored 60 days (newest first, backfill continues); `gsc-inspection` checked all 15 URLs (homepage indexed; 14 new pages "URL is unknown to Google", as expected for new pages). **Sitemap submission working**: after the owner granted Full permission on 2026-11-21, Google accepted `https://buildwithidris.com/sitemap.xml` (status pending download). A refused attempt is now retried automatically (bug found and fixed while verifying). |
| **Google OAuth (owner connection)** | **Implemented and tested; optional** | Alternative to the service account. Connecting as the owner grants full permission, including sitemap submission. Authorization-code flow, single-use state, tokens AES-256-GCM encrypted at rest, automatic refresh. Needs `GOOGLE_OAUTH_CLIENT_ID/SECRET` (owner action), then "Connect Google Search Console as owner" in the panel. |
| **IndexNow** | **Live and verified** | Production submissions accepted by api.indexnow.org (HTTP 200 "received") on first deploy and again after page changes, 6 URLs, change-driven only. |
| **Bing Webmaster Tools** | **Implemented and tested against a mock; awaiting your API key** | JSON API: page/query stats, crawl issues, quota, feeds, sitemap submission, **URL-level index status** (`bing-url-status`), **URL Submission API as fallback** when IndexNow fails (within the daily quota), and **real Bing keyword volumes** (`GetKeyword`) feeding measured demand. |
| **Core Web Vitals (PageSpeed Insights + CrUX)** | **Implemented and tested; production run blocked by quota** | Weekly lab and real-user metrics for key pages. On production, Google's shared keyless quota returned 429, which is recorded and shown, not hidden. Owner action: add a free `PAGESPEED_API_KEY`. |
| **Structured-data validation** | **Live and verified** | Every page's JSON-LD is validated daily against the official schema.org vocabulary (downloaded from schema.org) plus Google's required fields: **0 errors, 0 warnings** on all 15 pages. |
| **Content agent** | **Live; deterministic (no LLM, no API key, no cost)** | Title *and* description experiments (one variable at a time, alternating) built from verified page copy, keywords and real queries; research briefs. First live run: no low-CTR pages yet and no brief-worthy demand yet. That's correct for a new site with almost no impressions. |
| **Auto-fixer** | **Live and verified** | First production run fixed 5 over-long service titles. A second, real bug (double-escaped "&amp;" in those titles) was caught, fixed in code, and **self-healed on production by the next audit** (5 errors → 0). Every fix is versioned, re-rendered, verified, and rolled back automatically if it breaks anything. |
| **Competitor gap analysis** | **Implemented; optional** | Needs `SEO_COMPETITOR_URLS` (your choice of competitors). |
| **Google Business Profile** | **Not touched** (Phase 5 skipped as instructed) | — |

## 10. Automation architecture
```
Railway (always on, restartPolicy ON_FAILURE)
└─ node backend/server.js  (existing Express app)
   ├─ existing routes (content API, admin, uploads, messages, reviews, Search Insights)
   └─ backend/seo_engine/
      ├─ render/        prerendered home, services, projects, insights, 404, sitemap, robots, llms
      ├─ analytics.js   cookie-less referral, crawler and conversion counts
      ├─ integrations/  gsc (+ googleOAuth), bing, indexnow, pagespeed, http (retry, backoff, redaction)
      ├─ agents/        technicalAuditor, schemaValidator, autoFixer, performanceAnalyzer,
      │                 keywordIntelligence, contentOptimizer (snippet experiments + briefs),
      │                 competitorAnalysis, qualityGate
      ├─ pages.js       versioned page store (never deletes; rollback = new version)
      ├─ learning.js    change ledger, experiments, outcome stats -> change-type weights
      └─ scheduler.js   persistent jobs: lock, timeout, backoff, alerts, catch-up
Data: backend/data/seo/ on the existing Railway volume (next to content.json)
```
- **No new infrastructure.** It runs in the existing service and uses the existing volume, with no new database.
- **Independent of your computer.** It runs on Railway; the scheduler is on in production and off locally.
- **Requirement on Railway:** always-on (App Sleeping off) and **1 replica**. File locks also protect against overlapping deploys.

### Scheduled jobs (14)
| Job | Frequency | Needs | Production status |
|---|---|---|---|
| url-state: page changes → sitemap `lastmod` → IndexNow (Bing URL API fallback) | 30 min | — | ok, running every 30 min |
| sitemap-submit: GSC + Bing when the URL set changes (failed attempts retried) | daily | GSC Full permission / Bing | ok: Google accepted 2026-11-21 |
| gsc-sync: performance history, newest first | daily | GSC | ok |
| gsc-inspection: Google index status per URL | weekly | GSC | ok |
| bing-sync: page/query stats, crawl issues, quota | daily | Bing key | skipped (no key) |
| bing-url-status: Bing index status per URL | weekly | Bing key | skipped (no key) |
| performance-analysis | daily | GSC data | ok |
| keyword-intelligence: real queries, Bing volumes | weekly | GSC/Bing | ok (first real query found) |
| technical-audit: self-crawl + schema.org validation + missing-internal-link detection (orphans, case studies without a service-page link) + **auto-fix with verification** | daily | — | ok (0 errors, 0 warnings) |
| experiment-evaluation | daily | GSC data | ok |
| content-agent: snippet experiments + research briefs | weekly | GSC/Bing data | ok |
| core-web-vitals: PageSpeed lab + CrUX field | weekly | (optional) PageSpeed key | quota 429 (owner action) |
| competitor-analysis | monthly | `SEO_COMPETITOR_URLS` | skipped (optional) |
| weekly-report | weekly | — | ok |

## 11. Historical learning
- **Stored permanently:** daily GSC rows, Bing snapshots, URL Inspection history (Google and Bing), performance snapshots, Core Web Vitals history, the change ledger (before/after/reason/author), every page version, auto-fix history, experiments with baseline/post/verdict, the IndexNow and Bing URL-submission logs, technical-audit history, research briefs, job runs and alerts.
- **Experiments** change one variable (title *or* description, alternating per page). They're evaluated after a 4-day recrawl grace period plus a 28-day window with a two-proportion z-test, a minimum of 200 impressions per window, and a position-confounding guard. Losers are rolled back automatically.
- **Learning loop:** after 5 or more concluded trials of a change type (title, description), types that rarely help are paused and types that help are favoured. The agent can't modify its own code or safety rules.

## 12. Tests performed
**89/89 automated tests pass** (`automated_testing_report.md`), plus production verification: every job run on the live server through the admin API, live audits, Lighthouse runs on production, and computed-style checks proving the heading fix changes nothing visually.

## 13. Status summary
| Status | Items |
|---|---|
| **Implemented and verified on production** | Prerendering (2,051 words in raw HTML); 8 service pages + 7 project pages; linked JSON-LD (0 schema.org errors); sitemap, robots, llms.txt; www/index.html 301s; 404; analytics and attribution; versioning and rollback; 14-job scheduler; Search Console sync + URL Inspection; IndexNow; daily audit with auto-fix (5 fixed, then self-healed a real bug); performance analysis; keyword intelligence; research briefs; heading-order fix (Lighthouse accessibility 100); LCP fix (2.1 s → median 1.6 s); admin SEO panel; 200-post social plan |
| **Implemented and tested; waiting on an owner credential** | Bing data, Bing URL status, Bing URL-submission fallback, Bing keyword volumes (`BING_WEBMASTER_API_KEY`); Google sitemap submission (Full permission or OAuth); Core Web Vitals on production (`PAGESPEED_API_KEY`); Google OAuth connection (`GOOGLE_OAUTH_CLIENT_ID/SECRET`); competitor analysis (`SEO_COMPETITOR_URLS`) |
| **Not built, by your instruction or decision** | AI-written articles (you chose deterministic, no LLM: topics become briefs); Google Business Profile (Phase 5 skipped); automatic social posting (the brief said not to without platform authorization) |
| **Can only be confirmed over time** | Google/Bing indexing of the 14 new pages (submitted; Google reports them as not yet discovered); real-user Core Web Vitals (needs traffic volume); experiment results (need about 4–8 weeks of impressions) |

**Remaining measured gap:** homepage lab LCP median 1.6 s vs 1.4 s before the project (Performance 87–93 vs 94), the cost of shipping the real content in the HTML. A cover-image preload was tried, measured worse, and reverted.

**Found on a client site:** `jezzobhealthcare.org` has an **expired SSL certificate** (`CERT_HAS_EXPIRED`), so browsers and crawlers that validate certificates can't load it. The weekly link check will list it under "Needs you"; tell the client.

---

## 14. One-time setup checklist (only items that need you)

| # | What | Why | Where / how | Env var | How it's verified |
|---|---|---|---|---|---|
| 1 | **Change the admin password** (security) | Production still uses the demo login `admin` / `admin123`, which is written in the public README | Run `node backend/scripts/hash-password.js "your-new-password"` locally, then put the output in Railway → Variables | `ADMIN_PASSWORD_HASH` | Old password stops working |
| 2 | **Railway always-on, 1 replica** | The scheduler runs inside the server | Railway → service → Settings: App Sleeping off; Replicas 1 | — | `url-state` keeps running every 30 min |
| 3 | ~~Google sitemap permission~~ **Done 2026-11-21** | Sitemap submitted and accepted | — | — | `sitemap-submit` → `google.ok: true` ✓ |
| 4 | **Bing Webmaster Tools** | Bing/Copilot data, Bing index status, URL-submission fallback, keyword volumes | bing.com/webmasters → Import from Google Search Console → Settings → API access → Generate key | `BING_WEBMASTER_API_KEY` | `bing-sync`, `bing-url-status` → ok |
| 5 | **PageSpeed API key** (free) | Weekly Core Web Vitals on production (the keyless quota is exhausted) | console.cloud.google.com → APIs & Services → enable "PageSpeed Insights API" → Credentials → API key | `PAGESPEED_API_KEY` | `core-web-vitals` → ok; panel shows the metrics |
| 6 | **Google OAuth** (optional; alternative to 3a) | Connect Search Console as the owner | Google Cloud Console → Credentials → OAuth client ID (Web application), redirect URI `https://buildwithidris.com/api/admin/seo/google/oauth/callback`; then the panel → "Connect Google Search Console as owner" | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Panel shows "connected"; GSC mode = oauth |
| 7 | **Competitors** (optional) | Content-gap analysis | Pick 3–5 competitor homepages | `SEO_COMPETITOR_URLS` | `competitor-analysis` → ok |
| 8 | **Tell JEZZOB about the expired certificate** | Their site fails to load securely | — | — | Link check stops flagging it |
| 9 | **Credit links and social posting** (optional) | Legitimate prominence and discovery | Ask clients for a "Website by Idris Paul Kwaya" link; post from the 200-post plan | — | UTM visits in the panel |

**How to enter credentials securely:** Railway dashboard → service → **Variables**. Never commit them or paste them into chat. The engine reads keys only from the environment, redacts them from logs and errors, never returns them from any endpoint, and stores OAuth tokens encrypted.

## 15. Operating instructions
- **See what it's doing:** Developer Login → **SEO Engine**. It shows integrations, technical health and automatic fixes, owner actions, Core Web Vitals, every job's last and next run, research briefs, traffic by source (including AI assistants), crawler visits, page versions with **Roll back** / **Unpublish**, and recent changes with reasons.
- **Run a job now:** "Run now" on any job.
- **Undo a change:** Roll back in the panel, or `POST /api/admin/seo/pages/:id/rollback {version}`.
- **Stop everything:** set `SEO_SCHEDULER_ENABLED=false`.
- **Roll back the whole release:** redeploy tag `pre-seo-engine-2026-11-21` in Railway. `backend/data/seo/` can stay; the old code ignores it.
- **Run tests:** `cd backend && npm test`.
