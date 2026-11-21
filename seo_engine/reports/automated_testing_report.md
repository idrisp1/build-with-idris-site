# Automated Testing Report (Phase 10)

- **Run date:** 2026-11-21, on the owner's Windows machine, Node 24.13 (production runs Node 20 via Nixpacks)
- **Command:** `cd backend && npm test`, which runs `node --test --test-concurrency=1 "../seo_engine/tests/*.test.mjs"`
- **Result:** **89 tests, 89 passed, 0 failed, 0 skipped**

The tests start the **real** `backend/server.js` on a random port with an isolated SEO data directory, and call it over HTTP. External APIs (IndexNow, Bing) are replaced by local mock servers. **No test touches production or sends anything to Google, Bing or IndexNow.** The system makes no AI or LLM calls at all.

---

## A. Website preservation (`website-preservation.test.mjs`): 9/9 passed
| Test | Verifies |
|---|---|
| homepage returns 200 and keeps every existing section and nav anchor | All 9 sections, all 8 original nav anchors, the admin modals (login, project editor, profile, Search Insights, inbox, floating video). The nav has exactly 9 links: the original 8 plus Services. |
| existing projects, experience and contact content are present in the initial HTML | Every project title, every employer and the contact email are in the server HTML |
| content API keeps all 12 content keys | `/api/content` contract unchanged |
| authentication | Bad password → 401; a valid session is authenticated; anonymous isn't; logout invalidates the session |
| profile editing still saves, and the edit flows into the server-rendered page | `PUT /api/content` as admin works, unauthenticated → 401, the edit appears in the prerendered homepage; the original is restored |
| contact form still works and records an anonymous attribution | Message stored and visible in the admin inbox. Attribution recorded as `ai:chatgpt` with **no personal data** in the log. |
| visitor reviews | Submit → approve → delete |
| static assets, uploads route and Search Insights endpoint unchanged | Assets are served; the existing GSC panel endpoint still works and is still admin-only |
| new SEO admin API is admin-only | 401 without a session. The status response contains no secrets. |

## B. SEO (`seo.test.mjs`): 11/11 passed
- Valid sitemap with `lastmod` on every URL; empty `/insights` isn't published.
- **Every sitemap URL:** HTTP 200, exactly one `<h1>`, self-referencing canonical, title and description within length, no `noindex`, exactly one JSON-LD `@graph` with Person + WebSite, BreadcrumbList on subpages, and **no AggregateRating/Review/price**.
- Titles and descriptions are unique across pages.
- robots.txt allows the search and AI-search crawlers, blocks the training crawlers, and declares the sitemap.
- `/index.html` → 301 `/`; unknown URLs → real 404 with `noindex`; unknown service slug → 404.
- **www → apex 301** in production mode (tested with a real `Host: www.` header).
- Homepage initial HTML contains at least 1,500 words of real content, with no unreplaced template placeholders, and admin UI marked `data-nosnippet`.
- `llms.txt` served; IndexNow key file served at `/<key>.txt`; a wrong key → 404.
- **Technical auditor: 0 errors** crawling the running server.
- Landing pages: exactly 7, each maps to a verified agency category or engineering service, and no pair has overlapping primary keywords or titles (Jaccard < 0.6).
- Service copy contains no prices, guarantees or superlatives.

## C. Search integrations (`search-integrations.test.mjs`): 10/10 passed
- IndexNow key is generated once, persisted and well-formed.
- Correct payload (`host`, `key`, `keyLocation`, `urlList`); foreign-host URLs are never submitted; HTTP 200 is recorded as **"received", never "indexed"**.
- 429 → 503 → 202 retried with backoff and recorded as `received-key-pending`.
- 403 recorded as **rejected and not retried**.
- Network failure → URLs **stay queued** for the next run.
- Local rate limit blocks back-to-back submissions.
- **Change detection:** an unchanged page is never resubmitted; changed, added and removed pages are detected; a copyright-year change alone is ignored.
- Bing: JSON endpoint, `{d: …}` unwrapping, `/Date(…)/` normalization, key sent as a query parameter, **key never present in error messages**.
- Secret redaction works on logged text.
- Search Console reports "not configured" instead of pretending.

## D. Automation (`automation.test.mjs`): 10/10 passed
- Jobs run when due, persist state, and don't re-run early.
- **Restart:** a new scheduler instance resumes from disk; overdue jobs are rescheduled for catch-up within minutes of boot; run counts carry over.
- **Failures:** exponential backoff (about 2 → 4 → 8 min), each failure logged, an alert record after 3 consecutive failures, secrets redacted.
- Recovery resets the failure counter. Timeouts are enforced.
- **Duplicate prevention:** a held lock makes the job skip; a stale lock from a crashed process is taken over.
- Unmet requirements (missing credentials) are recorded as `skipped` with a reason, never as success.
- **Versioning and rollback:** every save adds a version with a reason; rollback adds a new version and never deletes history; the change ledger records before and after.
- **End-to-end via admin API:** a title override changes the live `<title>`, rollback restores it, a draft that failed the gate **can't be published (409)**, and a manual job run works.

## E. Content quality and learning (`content-quality.test.mjs`): 16/16 passed
- An evidence-backed article passes every gate check.
- The gate **rejects**: prices, guarantees, figures not in site evidence (e.g. "73%"), keyword cannibalization against service pages, claims citing non-existent evidence, fact-check findings, a missing fact-check, broken internal links, unknown projects, thin content, and near-duplicates of existing articles.
- Figures that **are** in the evidence (50,000+, 99.97%) are accepted.
- **Deterministic content agent (no LLM):**
  - Titles are built only from a real search query that matches the page's verified keywords, or from the page's own keyword. Unrelated queries are never used, and titles already tried aren't repeated.
  - A title experiment changes only the title and records a 28-day baseline. There's no second experiment on a page while one is running.
  - Research briefs are built only from site evidence and saved for you, never published as pages. The same topic isn't briefed twice within 90 days.
  - The Claude client file and `@anthropic-ai/sdk` dependency no longer exist (asserted).
- Brief selection refuses topics without observed demand or outside verified services, and skips topics already briefed.
- Statistics: the z-test separates improvement, decline and no significant change, and flags insufficient data and position-confounded results.
- **Experiment lifecycle:** a losing title is rolled back automatically, a winner is kept, and the outcome statistics update (2 trials, 1 improved, 1 worsened).
- The performance analyzer flags low CTR, declines, cannibalization and coverage gaps from stored history. No data is reported as "no-data", not as zero.
- Keyword dataset: valid statuses, at most one target per keyword, **no invented search volumes**.

## F. Social media document (`social-posts.test.mjs`): 7/7 passed
- Exactly 200 headings, Day 001 to Day 200 in order, and Day 001 is the Phoenix website post.
- Every post has all 9 fields plus a substantive caption.
- 200 unique topics and captions; **no two captions share 50% or more of their 5-word phrases**.
- Only LinkedIn, Facebook, Instagram, TikTok, YouTube and Reddit are used.
- Every link is on buildwithidris.com, UTM-tagged, and **resolves to an existing page** on the running server.
- Hashtags: 2–6 per post; Reddit has none.
- No prices, guarantees or superlatives. **Every figure is checked against the site's own evidence corpus.**

## G. Gap closure (`gap-closure.test.mjs`): 19/19 passed
- **Missing internal links:**
  - Orphan pages (nothing links to them) and case studies that no service page links to are detected and reported under "Needs you".
  - The live site has none.
- **Google OAuth:**
  - Tokens are AES-256-GCM encrypted at rest (no plaintext on disk) and tampering is detected.
  - The consent URL requests offline access plus the Search Console scope with the correct redirect URI.
  - `state` is single-use, so forged or replayed states are rejected.
  - Code exchange stores tokens, and Search Console then prefers the owner connection over the service account. The refresh token is kept when Google omits it on a later exchange.
  - The routes are admin-only.
- **Auto-fixer:**
  - An over-long title and a short description are fixed and verified on the re-rendered page, and versioned.
  - **Regression:** fixed titles render with single escaping (the production bug).
  - **Self-healing:** a double-escaped override is detected by the audit and repaired.
  - A fix that breaks the page (two `<h1>`) is rolled back automatically.
  - Client-site problems (certificates, 404s, DNS) are classified for you, not edited.
- **schema.org validation:**
  - Downloads the **official vocabulary**. Every JSON-LD node on every public page uses real types and properties, with **0 errors and 0 warnings**.
  - Invented types and properties and incomplete breadcrumbs are caught.
- **Snippet experiments:** after a concluded title experiment, the next one changes only the description, led by the real matching query, within 70–160 characters.
- **Bing:**
  - URL submission is capped at the daily quota and falls back to the alternate documented method casing.
  - Real `GetKeyword` volumes are recorded as measured demand.
- **Core Web Vitals:** lab and real-user field data are parsed and stored. A 429 quota response is reported as a failure, not hidden.
- **Accessibility and speed:**
  - The public homepage never skips a heading level.
  - The hero reveal script sits directly after the hero (LCP).

## H. Article studio, owner-written articles (`article-studio.test.mjs`): 7/7 passed (real server)
- Endpoints are admin-only.
- A good article passes without an AI fact-check (you're the author) and reports its URL.
- **Prices and guarantees always block publishing.** The blocked article is kept as a draft and never public (404).
- A figure that isn't on the site (e.g. "27%") blocks publishing until you confirm it.
- **Publishing makes the article live:** Article schema, inline links and bullets render correctly. The `/insights` index appears, the service page links to it, and it's in the sitemap and `llms.txt`. The source brief is marked "published".
- **Editing:**
  - Changing the title keeps the same URL.
  - A failing edit leaves the live page untouched.
  - "Save draft" over a live article is refused (409).
  - Each publish is a version.
- A second article on the same topic is blocked (keyword overlap or duplicate text).
- **Real-browser test (local server):** login → SEO Engine → "+ Write a new article" → fill → Check (blocked at 293 and 383 words, as designed) → add a section → Check passes → Publish → "View the live article" returns 200. No JavaScript errors.

---

## Additional verification (manual / tool-based, not in the npm suite)

| Check | Method | Result |
|---|---|---|
| Visual regression, homepage | Headless Chrome screenshots, live site vs. new local build | Same layout and design. The only visible additions are the "Services" nav link, the "Explore all services" button, "Learn more →" on agency cards, and "Case study" links on project cards. |
| Mobile rendering of new pages | Screenshot at 390 px width | Single-column layout, no horizontal scroll, readable type |
| Real browser admin flow | Puppeteer: Developer Login → SEO Engine panel → Edit Profile modal | All work. No JavaScript errors. The only failed requests are the two production-only `/uploads/` files (profile photo and promo video), which don't exist on this machine. |
| Client re-render keeps prerendered links | Puppeteer DOM check after JS ran | 7 case-study links and 7 "Learn more" links present after re-render |
| Lighthouse, service page (local) | Lighthouse 12.2.1, mobile | Performance 100, Accessibility 100, Best Practices 100, SEO 100 |
| Lighthouse, homepage A/B on the same machine | 3 alternating runs each, original code vs. new code, same content | Original: Performance 87/90, median TBT 432 ms, LCP 2.35 s, CLS 0.004. New: 85/88/85, TBT 357 ms, LCP 2.86 s, CLS 0.000. TBT and CLS improved; **LCP about 0.5 s slower locally**, because the HTML is about 31 KB larger uncompressed (it now carries the content) and the local server doesn't compress. Production's edge gzips HTML (measured 132 KB → 28 KB), so the production impact should be smaller, **but this must be re-measured on production after deploy.** |
| Lighthouse accessibility, homepage | Same run | 98 (was 89). The form-label and ARIA failures are fixed. Heading order (h2→h4) is left as is, because changing those tags would change the existing design. |

## Production verification after deploy (commit `93d997b`, 2026-11-21)
| Check | Result |
|---|---|
| `/`, `/services`, `/services/ai-development`, `/projects/peggy`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` | 200 |
| `/insights` (no articles yet), unknown URL | 404 (as designed) |
| `/index.html` | 301 → `https://buildwithidris.com/` |
| `https://www.buildwithidris.com/services` | 301 → `https://buildwithidris.com/services` |
| Homepage initial HTML | 2,051 words (was 296); title "Idris Paul Kwaya \| AI Systems Engineer in Phoenix, AZ" |
| Sitemap | 15 URLs |
| robots.txt | OAI-SearchBot allowed, GPTBot disallowed |
| Lighthouse (mobile), `/services/ai-development` | Performance 100, Accessibility 100, Best Practices 100, SEO 100 (LCP 1.0 s) |
| Lighthouse (mobile), homepage | Performance **91** (baseline 94), Accessibility **98** (baseline 89), Best Practices 100, SEO 100. LCP **2.1 s (baseline 1.4 s)**, TBT 340 ms, CLS 0. **A small, real LCP regression** caused by the larger HTML. Recorded as a follow-up item. |

## Production verification, second pass (2026-11-21, every job run on the live server via the admin API)
| Job | Result on production |
|---|---|
| technical-audit | 15 pages; schema validated against schema.org; **auto-fixed 5 over-long titles**, verified, 0 errors / 0 warnings after |
| (bug found) | Those 5 titles rendered as `&amp;amp;` (double-escaped). Fixed in code with regression tests; the **next production audit detected all 5 and self-healed them** (errors 5 → 0). Live `<title>` now correct. |
| url-state | Detected the 6 pages changed by the deploy; **IndexNow HTTP 200 "received"** |
| gsc-sync | 60 days stored, newest first |
| gsc-inspection | 15 URLs: homepage **PASS** (indexed); 14 new pages **"URL is unknown to Google"** (not yet discovered) |
| performance-analysis | ok (no impressions yet on new pages) |
| keyword-intelligence | ok; **first real query discovered: "idris ai"** |
| experiment-evaluation / content-agent | ok; no low-CTR pages and no brief-worthy demand yet (correct for a new site) |
| sitemap-submit | **Google 403**: service account has Restricted permission (owner action) |
| core-web-vitals | **429**: Google's shared keyless PageSpeed quota exhausted (owner action: free API key) |
| bing-sync / bing-url-status | skipped: no Bing API key (owner action) |
| weekly-report | ok |

**Lighthouse (mobile) on production, homepage, after all fixes** (3 valid runs): Performance 87 / 93 / 89, **Accessibility 100**, Best Practices 100, SEO 100, **LCP 1.6 / 1.6 / 2.1 s (median 1.6 s)**, CLS 0. Before the project: 94 / 89 / 100 / 100, LCP 1.4 s. After the first deploy: 91 / 98 / 100 / 100, LCP 2.1 s. A cover-image preload was tried, measured worse (2.0–2.1 s), and reverted.

**Heading fix is visually identical:** computed font size, weight, margins and line height of every converted heading are the same on live (old `h4`) and new (`h3`).

## Still not verifiable (needs an owner credential, or time)
- Real Bing Webmaster API calls: no `BING_WEBMASTER_API_KEY` yet. The client is tested against a mock that follows the documented JSON format.
- Google sitemap submission: blocked by the service account's Restricted permission (403 recorded on production).
- Core Web Vitals via PageSpeed on production: keyless quota exhausted (429 recorded). Lab metrics were verified with Lighthouse runs instead.
- Real-user Core Web Vitals (CrUX): needs more traffic than the site has today.
- Google OAuth end-to-end consent: needs your OAuth client ID. The flow is tested up to Google's consent screen, plus the token exchange with a stubbed Google response.
- Indexing of the 14 new pages: submitted and discoverable, but Google decides when to crawl. The weekly `gsc-inspection` tracks it.

Verified on production since the first report: Search Console API calls, IndexNow submissions (HTTP 200), and schema.org validation of every page.
