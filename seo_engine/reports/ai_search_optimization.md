# AI Search Discoverability (Phase 6)

- **Date:** 2026-11-21
- **Scope:** ChatGPT search, Microsoft Copilot, Google AI search experiences, Perplexity and similar assistants. Everything listed as implemented here is in the code and covered by tests (see `automated_testing_report.md`). Nothing is claimed for live production until it has been deployed and verified there.

## 1. How these systems find and cite a site (what we can and can't influence)

| System | How it gets content | What the site controls |
|---|---|---|
| **ChatGPT search** | OpenAI's **OAI-SearchBot** crawls for search. **ChatGPT-User** fetches pages when a user asks. **GPTBot** is the separate *training* crawler. OpenAI says robots.txt changes take about 24 hours to apply. | Allow OAI-SearchBot. GPTBot is controlled separately (blocked, by owner decision). Content must be in the HTML. |
| **Microsoft Copilot** | Grounded on the **Bing** index (Bingbot) | Bing discoverability: sitemap, IndexNow, Bing Webmaster Tools |
| **Google AI Overviews / AI Mode** | Google's normal index (Googlebot). The `Google-Extended` token controls use for Gemini *training/grounding*, not Search inclusion. | Normal Google SEO. Blocking Google-Extended doesn't remove the site from Search or AI Overviews. |
| **Perplexity** | **PerplexityBot** (index) and **Perplexity-User** (user fetches) | Allow PerplexityBot. Content in HTML. |
| **Claude (web search)** | **Claude-SearchBot** / **Claude-User** for search; **ClaudeBot** for training | Allow the search agents, block ClaudeBot (owner decision) |

Nobody can force an assistant to cite a site. What we control is eligibility (crawler access + readable HTML), clarity (unambiguous facts about who, what, where), and evidence (real projects, credentials, contact details).

## 2. What was wrong before

- **Content was invisible to most AI crawlers.** The raw HTML had about 296 words, and projects, services and experience only appeared after JavaScript ran. OAI-SearchBot, PerplexityBot and link-preview fetchers generally don't execute JS.
- There was one URL for everything, so an assistant had no page it could cite for "web design Phoenix" or "AI automation for small business".
- No crawler policy distinguished search from training.
- There was no way to measure AI referrals.

## 3. Implemented

### 3.1 Crawler policy (`/robots.txt`, generated in `backend/seo_engine/render/discovery.js`)
- **Allowed** (explicit groups): `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Claude-SearchBot`, `Claude-User`, `Bingbot`, `Googlebot`, plus `*`.
- **Blocked** (owner decision, 2026-11-21: block training crawlers): `GPTBot`, `Google-Extended`, `CCBot`, `ClaudeBot`, `Applebot-Extended`, `Meta-ExternalAgent`, `Bytespider`.
- `/api/` stays disallowed for everyone.
- To change the policy, edit `TRAINING_CRAWLERS` / `SEARCH_CRAWLERS` in `discovery.js`. Tests assert both lists.

### 3.2 AI-readable content
- **Homepage prerendering.** The full profile, projects, AI systems, agency services, experience, education, references and contact details are now in the initial HTML (2,021 words, measured locally). The existing client JS re-renders identical markup, so the design is unchanged (verified with screenshots).
- **One page per verified service** (7), a services hub, and **project case-study pages** (6 indexable; Dawn Podcast is `noindex` until its description is longer). Each is server-rendered, so assistants have a specific URL to cite per topic.
- **Clear, factual copy.** Each page states who (Idris Paul Kwaya), what (the service), where (Phoenix, AZ, plus remote U.S.), proof (live projects, experience bullets pulled from the profile) and how to make contact. FAQ sections answer the questions people ask assistants ("What does an AI Systems Engineer do?", "Can you guarantee rankings?" (no), and so on).
- **`/llms.txt`** gives a plain-language map of services, projects and contact details, generated from live content. It's an emerging, optional convention that no major engine has confirmed relying on, so treat it as a supplement.
- Admin-only UI is marked `data-nosnippet`, so editor labels aren't used as snippets.

### 3.3 Structured data (one linked `@graph` per page)
- `WebSite` → `publisher` → `Person` (Idris Paul Kwaya: jobTitle, Phoenix address locality, `sameAs` GitHub and LinkedIn, `alumniOf` both universities, `hasCredential` Google Cloud certification, `knowsAbout` from real project tags).
- `ProfessionalService` (the agency): `founder` → Person, phone and email (already public on the site), `areaServed` Phoenix + United States, and an `OfferCatalog` linking all 7 `Service` nodes.
- Per page: `WebPage`/`ProfilePage`/`CollectionPage`, `BreadcrumbList`, `Service` (service pages), `FAQPage` (service pages), `CreativeWork` (projects), and `Article` (future articles, with author → Person).
- **Never emitted:** `AggregateRating`, `Review`, prices or offers with amounts. Tests assert their absence on every page.
- Validation: every JSON-LD block is parsed in tests and by the daily technical audit. **Not yet done:** running the live URLs through Google's Rich Results Test and validator.schema.org after deploy. Those are web tools that need the public URL (setup checklist step).

### 3.4 Discovery
- The sitemap lists every indexable page with a real `lastmod` (from content-hash change tracking).
- IndexNow notifies Bing (which grounds Copilot) and other engines whenever a page is added, changes or is removed.
- Bing Webmaster sitemap submission runs once the API key is set.

### 3.5 Measuring AI referrals and AI crawler activity (`backend/seo_engine/analytics.js`)
- **Referrals.** Every page view is classified by referrer and `utm_source`. ChatGPT search links usually carry `utm_source=chatgpt.com` → `ai:chatgpt`. The same works for `perplexity.ai`, `copilot.microsoft.com`, `gemini.google.com` and `claude.ai`.
- **Conversions.** The contact form sends the visitor's first-touch source (stored in `sessionStorage` only), so a lead from ChatGPT is recorded as `ai:chatgpt`. No personal data is stored in the attribution log (tested).
- **Crawler activity.** Daily counts of OAI-SearchBot, PerplexityBot, Claude-SearchBot, Bingbot, Googlebot and others, per page, show whether AI search systems are actually fetching the new pages.
- **Where to see it:** Developer Login → **SEO Engine** → "Traffic, last 28 days", plus the weekly report (`/api/admin/seo/reports/weekly`).
- **Privacy:** no cookies, no IP addresses, no user-agent strings and no third-party scripts are stored. Only aggregate counts are kept.

## 4. Limits, stated plainly
- Citation in AI answers can't be guaranteed or directly measured. Referral traffic and crawler visits are the measurable proxies.
- `utm_source=chatgpt.com` appears on links ChatGPT adds in search results. Copy-pasted links won't carry it, so some AI-originated visits will show as "direct".
- Bing's AI features depend on Bing indexing, which in turn depends on the Bing Webmaster setup (checklist).
- Nothing in this engine writes to the Google Business Profile (Phase 5 was skipped as instructed).
