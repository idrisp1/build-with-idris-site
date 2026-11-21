# Initial Website Audit — buildwithidris.com

- **Audit date:** 2026-11-21
- **Scope:** local repository (`c:\Users\quien\Downloads\buildwithidris`) + the live production site (`https://buildwithidris.com`)
- **Status:** Phase 0 discovery is complete. No site code or content was changed while writing this audit.

Everything below was observed directly. Where something could not be verified, the report says so.

---

## 1. Backup and baseline (done before any change)

| Item | Status | Location / evidence |
|---|---|---|
| Git state recorded | Done | `HEAD = 177d3af`, branch `main`, working tree clean |
| Full repo backup | Done, verified | `C:\Users\quien\Downloads\buildwithidris_backups\2026-11-21_pre-seo-engine\repo.bundle` (`git bundle verify` passed) |
| Baseline git tag | Done | `pre-seo-engine-2026-11-21` (local tag, not pushed) |
| Live public content snapshot | Done | `live_content_snapshot.json` (full `/api/content` response, `updatedAt 2026-10-26T01:16:43Z`) |
| Live rendered HTML, robots.txt, sitemap.xml | Done | `live_index_rendered.html`, `live_robots.txt`, `live_sitemap.xml` |
| Local env config preserved | Done | `backend.env.local-copy` (local demo creds only; production env lives in Railway) |
| Performance baseline | Done | `lighthouse_mobile_baseline.json` (Lighthouse 12.2.1, mobile, live site) |
| Production messages and reviews | **Not backed up** | Admin-only endpoints. Backing them up needs an admin session or a Railway volume snapshot. |
| Database migration history | N/A | There is no database. Content is stored in JSON files (see §3). |

**Rollback path:** `git reset --hard pre-seo-engine-2026-11-21` locally, or redeploy commit `177d3af` on Railway. The new SEO data will live in a separate folder (`backend/data/seo/`), so rolling back code cannot damage existing content.

---

## 2. Technology stack and architecture

| Area | Finding |
|---|---|
| Frontend | One static `index.html` (2,526 lines) with vanilla JS. No framework, no build step. Times New Roman, purple glassmorphism design. |
| Backend | Node.js + Express 4.19 (`backend/server.js`, ES modules). Deps: helmet, cors, express-rate-limit, cookie-parser, multer, bcryptjs, googleapis 188. |
| Runtime | Railway uses Nixpacks with `nodejs_20` (`nixpacks.toml`); restart policy is `ON_FAILURE` ×10. Local machine has Node 24.13. |
| Hosting | Railway (`server: railway-hikari`, edge `lax1`). Apex is served over HTTPS with HSTS; `http://` returns 301 to `https://`. |
| Deployment | GitHub `idrisp1/build-with-idris-site`. Railway deploys from the repo. There's no CI workflow in the repo. |
| Persistence | JSON files on a Railway volume mounted at `backend/data`: `content.json`, `messages.json`, `reviews.json`, `uploads/`. Writes are atomic (temp file + rename). The local `backend/data` is empty; real content exists only in production. |
| Content model | 12 string keys (`CONTENT_KEYS` in `contentStore.js`, mirrored as `STORAGE_KEYS` in `index.html`). Each is JSON-encoded: profile, stats, projects, ai-systems, agency, experience, education, certifications, contact-info, references, section-visibility, floating-video. |
| CMS | In-place admin editing on the public page after "Developer Login". Changes are pushed to open tabs over SSE (`/api/events`). |
| Auth | One admin account (bcrypt hash in env) with a signed httpOnly cookie. Sessions live **in memory**, so a restart logs the admin out. |
| Background jobs / scheduler | **None.** |
| Analytics | **None.** No GA4, no first-party tracking, no referrer logging. |
| Email notifications | None. Contact messages are only stored and shown in the admin inbox. |
| Search Console | `backend/lib/searchConsole.js` uses a service account with the `webmasters.readonly` scope. It runs only when the admin opens "Search Insights", with a 15-minute in-memory cache. **No history is stored.** Whether the `GSC_*` env vars are set in production couldn't be verified (the status endpoint is admin-only). |
| GSC verification | A `google-site-verification` meta tag is present in `index.html`. |
| Bing / IndexNow | Not present. |
| Existing SEO/keyword files | None in the repo. Keyword research so far was only an on-demand GSC panel feature. |

### Public routes (live, verified with curl)

| Route | Status | Notes |
|---|---|---|
| `/` | 200 | The entire site. OG tags and JSON-LD are injected server-side. |
| `/index.html` | 200 | Duplicate of `/`. Canonical points to `/`, so this is low risk. |
| `/health` | 200 | `{"ok":true}` |
| `/robots.txt` | 200 | Generated in `server.js` |
| `/sitemap.xml` | 200 | **One URL only**, no `lastmod` |
| `/assets/*`, `/uploads/*` | 200 | Static files, cached 7 days |
| `/api/*` | JSON | Content, messages, reviews, admin, search-console |
| `https://www.buildwithidris.com/` | **200** | Full duplicate host. It should 301 to the apex. |
| anything else | 404 | Plain-text body "Not found." |

### Public page sections (anchor navigation, all on `/`)

Nav: Projects · AI Systems · Agency · Experience · Education · References · Reviews · Contact, plus "Developer Login" and "Contact Me".
Sections in order: Hero (+About Me) → Featured Work → All projects → AI Systems → Agency → Work experience → Education & certifications → References → Reviews (visitor-submitted, moderated) → Contact form → Footer.

---

## 3. What the site says about you (verified, from live content)

### Identity
- **Name as displayed:** "Idris Paul Kwaya" (profile, OG title, JSON-LD) and "Idris Paul" (nav, `<title>`, footer, og:site_name). Full name "Idris Paul Kwaya Quiendum" is stored but not shown. **The name is inconsistent across signals** (see §6).
- **Title:** AI Systems Engineer. Headline: "Building production-ready AI and backend systems that actually ship."
- **Location:** Phoenix, AZ, USA. Full U.S. work authorization.
- **Positioning:** primarily an AI systems / backend engineer. Open to full-time roles **and** "select freelance engagements". The agency appears as a secondary section labelled "Also running".
- **Credentials:** Google Cloud Certified Professional Cloud Developer. B.S. CS (University of Buea, 2018–2022). M.S. CS at Grand Canyon University (in progress since Aug 2025).
- **Contact:** contact@buildwithidris.com, 480-562-7514, LinkedIn, GitHub (`idrisp1`), résumé on Google Drive.

### Services, classified as the brief requires

**A. Explicitly offered (agency section; your local "Ads Campaign" app performs these, noted per your instructions and not touched)**

| # | Category | Listed sub-services |
|---|---|---|
| 1 | Digital Marketing & Advertising | Paid ad campaigns, audience targeting, strategy, competitor research, campaign monitoring |
| 2 | Website Design & Development | New sites, redesign/modernization, maintenance, performance optimization, broken-link fixes |
| 3 | SEO & Online Visibility | SEO audits, keyword research, on-page SEO, competitor SEO analysis |
| 4 | AI-Powered Data Annotation & Evaluation | Image classification, object detection, bounding boxes, text classification, sentiment, NER, audio transcription, video annotation, AI response evaluation |
| 5 | Document Processing & Data Management | Invoice/receipt processing, PDF extraction, PDF→Excel/CSV, data entry, cleaning, classification, validation |
| 6 | Business Research & Intelligence | Company, competitor, market, and product research; business verification; lead generation |
| 7 | Business Process Automation & AI Solutions | Workflow automation, repetitive-task automation, AI agent development/integration, automated data processing, reporting |

Stated audience: small and local businesses. Stated area: Phoenix, Arizona and surrounding areas.

**B. Offered through "select freelance engagements" (engineering), backed by projects and experience**
- Full-stack and backend web application development (Node/Express, React, Flask, PostgreSQL)
- Serverless and cloud backends (AWS Lambda, API Gateway, SQS, EC2, Docker)
- E-commerce builds with Stripe payments (CareScrubs, Luxe By Bokeh)
- Booking and business-management platforms (Peggy's Locs and Dreads)
- HIPAA-compliant healthcare software with JWT/RBAC (JEZZOB, Cadens)
- SMS/email workflow automation with Twilio (Cadens)
- AI chatbots on Microsoft Copilot Studio / Azure AI (MTN Cameroon)
- AI agents and orchestration, multi-provider LLM routing (self-built AI IDE, demoed on video)
- Model fine-tuning and MLOps on RunPod GPUs, HuggingFace publishing (self-built dashboard, demoed on video)
- Real-time apps: WebRTC streaming, SSE live sync

**C. Skills that should NOT be turned into commercial services**
- The GBP/USD forex trading bot is your own startup. Promoting trading software as a service raises financial-compliance issues and isn't an offering.
- Generic technology names (Socket.IO, Redis, GraphQL) are supporting evidence, not services.

**D. Not established anywhere on the site (no pages or claims will be created for these unless you confirm them)**
- WordPress, Shopify, Wix/Squarespace development
- Mobile app development
- Any pricing or packages (none are public; your local app holds packages, but they aren't published)
- Nationwide/remote service area (the agency copy says Phoenix and surrounding areas; freelance engineering is implied but not stated as remote)
- Social media management as a stand-alone service (the agency description mentions "social media content", but none of the 7 service categories lists it)

### Projects (7 total, all real, with live links where they exist)
Peggy's Locs and Dreads (featured, video), Luxe By Bokeh (featured, video), HIPAA Patient Platform / JEZZOB, Cadens Health & Wellness, CareScrubs Uniforms, Dawn Podcast FM TV (open source), Enterprise AI Support Chatbot / MTN. Plus 4 AI Systems cards, 3 of them with real walkthrough videos.

### Social proof
- 4 References: client quotes attributed to organisations, **each publishing the referee's personal email and phone number** (see §6).
- Visitor Reviews: moderated; 0 approved at audit time (`/api/reviews?status=approved` returns `[]`).

---

## 4. Technical SEO findings (live)

### What works
- HTTPS + HSTS; HTTP→HTTPS 301; gzip on HTML (132 KB raw → 28 KB transferred).
- `<meta name="robots" content="index, follow">`, canonical `https://buildwithidris.com/`, viewport set, `lang="en"`.
- Open Graph and Twitter card tags are rendered server-side from live content.
- JSON-LD: `Person` + `ProfessionalService` are server-rendered from real content, with no fabricated ratings.
- robots.txt allows everything except `/api/` and declares the sitemap. No AI crawler is blocked.
- **Lighthouse mobile baseline:** Performance **94**, Accessibility **89**, Best Practices **100**, SEO **100**. FCP 1.1 s, LCP 1.4 s, TBT 300 ms, CLS 0, total weight 2.0 MB (the floating promo video is 1.68 MB).
- Images are WebP (32–82 KB) with alt text on project images.

The Lighthouse SEO score of 100 only covers basic tags. It doesn't measure the structural problems below.

### Problems (ordered by impact on discovery)

1. **The whole site is one URL.** Seven agency services, about ten engineering capabilities, seven projects and the bio all compete for one `<title>` and one ranking slot. Google can't rank a page about "website design Phoenix" or "AI automation for small business" when no such page exists. This is the main structural limit on organic growth.
2. **The content only exists after JavaScript runs.** The raw HTML has about **296 words**: section headings and empty `<div>`s. Projects, services, experience, About Me, contact details and stats are all loaded from `/api/content` by client JS.
   - Googlebot renders JavaScript, though rendering is queued and can be delayed.
   - OpenAI's OAI-SearchBot, PerplexityBot, ClaudeBot, Bingbot's fast path and most link-preview scrapers generally **do not run JS**. For them the site is nearly empty, which directly limits ChatGPT, Perplexity and Copilot discovery.
3. **Admin UI text leaks into the crawlable HTML.** Strings such as "Developer Mode: editing live profile", "Edit About Me", "Manage Projects" and "Log Out" are in the raw HTML (hidden by CSS for guests). Non-JS crawlers index them as page text.
4. **Title and description are weak and inconsistent.**
   - `<title>` is hard-coded as "Idris Paul | AI Systems Engineer", while the OG title is "Idris Paul Kwaya | AI Systems Engineer".
   - The meta description is the 68-character headline. It doesn't mention Phoenix, the services or the agency.
5. **Structured data gaps.**
   - `Person` and `ProfessionalService` are separate, unlinked blocks (no `@id`).
   - `areaServed` is a full sentence instead of a `Place` / `City`.
   - The description renders with a double period ("Smarter Growth..").
   - There's no `WebSite`, `Service`/`OfferCatalog`, `ContactPoint`, `alumniOf` or `hasCredential` markup, although all of that data exists on the site.
6. **The sitemap lists one URL** with no `lastmod`.
7. **The www host is a duplicate.** `www.buildwithidris.com` returns 200 with the same page. The canonical tag softens this, but it should be a 301.
8. **There is no measurement layer.** No analytics, no referrer logging and no conversion tracking (contact form submits are stored but not attributed). ChatGPT referrals (`utm_source=chatgpt.com`) can't be measured today.
9. **GSC data isn't kept.** Each "Search Insights" view is a live query, so there's no trend history, which every later learning phase depends on.
10. **Bing Webmaster Tools and IndexNow aren't set up.**
11. **Accessibility failures** (Lighthouse): heading order skips levels (h2→h4 in Education/Reviews), contact/review form fields lack associated `<label for>`, and prohibited ARIA attributes are used.
12. **The 404 page is bare plain text** ("Not found."), with no links back into the site.
13. **No llms.txt.** It's optional, and no major engine has confirmed using it. It's low-cost and will be evaluated in Phase 6.

### Indexing status
Not verifiable from outside without Search Console access. I did not scrape Google results (that would breach Google's terms). Real indexing status will come from the URL Inspection API once the GSC credentials are confirmed working.

---

## 5. Content and conversion gaps

- **Mixed audience.** The copy speaks to two audiences: employers ("so employers see the strongest work", "Tell me about the role") and business clients (the agency section). Service searchers land on a hiring-oriented page with no service-specific path to a contact.
- **No service detail.** Each agency service is one sentence. There's no page that explains process, scope, deliverables, which projects prove it, or FAQs.
- **No project detail pages.** The projects are strong, real evidence (live client sites, HIPAA work, Stripe e-commerce), but they only exist as cards and modals, with no URL to rank or cite.
- **No educational content** (articles, guides, FAQs) for informational searches.
- **The contact form isn't segmented** (no "what do you need?" field) and sends no email notification, so leads can be missed.

---

## 6. Issues needing your decision (I have not changed any of these)

1. **Third-party personal data is public.** The References section publishes four referees' personal email addresses and phone numbers. Crawlers and scrapers can harvest them. Please confirm each referee consented to public display, or I can suggest a "references available on request" variant. I won't change this without your instruction.
2. **Name consistency.** "Idris Paul" (title/nav/footer) vs "Idris Paul Kwaya" (profile/OG/schema). Search engines and AI systems build an entity from consistent naming. Which form should be canonical? Your Google Business Profile name should also match how the agency is named on the site.
3. **Timeline wording.** About Me says "At JEZZOB … I own a HIPAA-compliant platform" (present tense), but the experience entry ends Apr 2026. "4+ yrs post-grad" while the MTN (2018–2021) and CareScrubs (2019) roles predate the 2022 B.S. A careful reader may question this. Content is yours, so I won't edit it; flagged only.
4. **Service area.** Phoenix only, or also remote U.S. / international clients? This decides whether location keywords target Phoenix only.

---

## 7. Functionality that must be preserved (regression checklist)

- Public page renders all sections from `/api/content`; section visibility toggles still work.
- Developer Login → in-place editing of every content key, uploads (images/video), SSE live sync to guest tabs.
- Project CRUD, featured flag, project modal with video.
- AI Systems cards with walkthrough video modals.
- Floating draggable promo video (admin-controlled).
- Contact form → admin message inbox; visitor reviews → moderation.
- Search Insights panel (existing GSC read-only dashboard).
- OG/Twitter share previews, JSON-LD, GSC verification meta tag.
- robots.txt, sitemap.xml, `/health`.
- Current design, nav anchors and layout at desktop and mobile widths.
- Rate limiting, helmet headers, CORS for apex + www.

---

## 8. Recommended implementation plan (proposed, pending your answers to §6 and the setup questions)

Guiding rule: **extend, don't rebuild.** Everything new is server-rendered by the existing Express app from the existing `content.json` (so admin edits flow everywhere automatically), plus a new, separate `backend/data/seo/` store on the same Railway volume. That means no new infrastructure.

**Step 1: Crawlability of the existing page (no visual change)**
- Server-render the real content into the existing section containers in `index.html`. The existing JS still re-renders on load and stays the source of truth for the design. This progressive-enhancement step makes the full content visible to non-JS crawlers.
- Remove admin-only markup from the guest HTML response.
- Dynamic `<title>` and meta description built from real content.
- Fix the JSON-LD into one linked `@graph`: WebSite, Person, ProfessionalService, OfferCatalog of the 7 real services, and credentials.
- Add a www→apex 301, and make `/index.html` a 301 to `/`.
- Fix the accessibility failures (heading order, form labels, ARIA).
- Add a proper HTML 404 page.

**Step 2: A small set of evidence-backed pages** (final list decided in Phase 2 from keyword evidence, not a quota)
- `/services` hub, plus one page per genuinely distinct service intent. Initial candidates are mapped to the 7 real agency categories and the engineering offering, consolidated where intents overlap (e.g., Document Processing and Data Annotation may not justify separate pages).
- `/projects/<id>` pages generated from the 7 real projects. These are evidence pages and are linked from the existing project cards.
- `/insights/<slug>` for educational articles, published only through the quality gate.
- **Navigation:** the existing 8 anchors stay. At most one new header link ("Services") is added, only with your OK. Everything else is reached through contextual links.

**Step 3: Measurement**
- First-party, cookie-less server-side logging of landing page, referrer host and UTM source (including `chatgpt.com`, `perplexity.ai`, `copilot.microsoft.com`, `bing.com`, `google.*`) and contact-form conversions. It's stored on the volume with no third-party scripts and no personal data.

**Step 4: Search integrations**
- GSC: persist daily page/query data, run sitemap submit/status and URL Inspection. Sitemap submit needs the full `webmasters` scope and Owner/Full permission for the service account.
- Bing Webmaster API (API key).
- IndexNow (key file served at the root, change-driven submissions only).

**Step 5: Automation**
- An in-process scheduler inside the Express server on Railway. It runs 24/7 independent of your PC, with persistent job state, a lock to prevent duplicate runs, retries with exponential backoff, timeouts and catch-up after restarts.
- Jobs: GSC sync, Bing sync, technical self-crawl audit, sitemap diff → IndexNow, opportunity analysis (low CTR, decliners, gaps, cannibalization), AI-referral report, content agent.
- Every change is versioned, with rollback through an admin endpoint/panel.

**Step 6: Content agent with a hard quality gate**
- Deterministic safe changes run automatically: metadata, internal links, sitemap.
- Writing new articles needs an LLM API and your decision (see the setup questions).
- Every claim must trace back to `content.json` evidence, or the draft is not published.

**Step 7: Social calendar and reports**
- The 200-post document, the remaining reports and the tests.

---

*Next: Phase 1, the search discovery audit, which depends on the official documentation review. Implementation starts after you've seen this plan and answered the open questions.*
