# Search Discovery Audit (Phase 1) — buildwithidris.com

- **Date:** 2026-11-21
- **Builds on:** `initial_website_audit.md`, which holds the raw findings. This report explains *why* those findings matter for discovery and turns them into the requirements the implementation follows.
- **Policy basis:** Google Search Essentials (technical requirements, spam policies, key best practices), Google's "helpful, reliable, people-first content" guidance, Google's local ranking guidance (relevance, distance, prominence), Bing Webmaster Guidelines, the IndexNow protocol (indexnow.org), and OpenAI's crawler documentation (developers.openai.com/api/docs/bots).

---

## 1. How discovery works, and where this site stands

| Stage | What the engine needs | Current state of buildwithidris.com | Gap |
|---|---|---|---|
| **Discover** | URLs found through links, sitemaps, and (for Bing/Yandex/Seznam/Naver) IndexNow pings | 1 URL in the sitemap. No inbound links I could verify. No IndexNow. | Every new page needs a sitemap entry, internal links pointing to it, and an IndexNow ping |
| **Crawl** | robots.txt allows the URL, server returns 200 fast | Yes, for `/`. robots.txt allows all except `/api/`. TTFB is about 100–270 ms. | Fine. Keep `/api/` disallowed. |
| **Render** | Google renders JS on a deferred queue. Most AI crawlers and many other bots do **not** run JS. | Real content exists only after JS fetches `/api/content` | **Critical:** server-render the content |
| **Index** | Indexable, canonical, not a duplicate, useful | `/` is indexable and canonical. `/index.html` and `www.` are duplicates (canonical softens this). | 301 both duplicates |
| **Understand** | Clear topic per URL, headings, structured data, consistent entity naming | One URL covers about 17 distinct topics. Name differs across signals. Schema blocks aren't linked. | One topic per URL. One name. A single linked `@graph`. |
| **Rank** | Relevance to the query, quality/helpfulness, and prominence (links, mentions, reviews). For local queries: relevance, distance, prominence. | No page matches service queries. Prominence signals are weak and new. | Pages per real service. Evidence-rich project pages. Honest local signals. |
| **Click** | Title and snippet that match intent | Title "Idris Paul \| AI Systems Engineer". Description is a 68-character slogan. | Intent-matched titles and descriptions per page, then measured CTR experiments |
| **Measure** | Search Console, Bing WMT, analytics | GSC panel works live but stores no history. No Bing. No analytics. | Persistent history plus first-party referral logging |

## 2. Relevance: a single page can't rank for distinct intents

Google ranks **pages**, not sites. A query such as "website design Phoenix", "AI automation for small business", "pdf data extraction service" or "hire LLM engineer" is matched against a page whose title, headings, body and links are about that topic. On buildwithidris.com each of those topics is one sentence inside a card on a page whose title is a personal name. The fix isn't more keywords on the homepage. It's one well-evidenced page per **genuinely distinct customer need**. The architecture rules in Phase 2 decide which needs qualify.

## 3. Rendering: why server-side content matters beyond Google

- **Googlebot** renders JavaScript, but rendering is a second, deferred pass. Content that only appears after an API call is indexed later and less reliably than HTML content.
- **OAI-SearchBot** (ChatGPT search), **PerplexityBot**, **Claude-SearchBot**, link-preview fetchers and many SEO crawlers fetch raw HTML. Today they see about 296 words, mostly headings and admin labels.
- **Requirement adopted:** every public page must contain its full primary content in the initial HTML response. The existing client JS can re-render on top of it (progressive enhancement), and the markup must be identical so nothing changes visually.

## 4. Helpful content and spam-policy guardrails (binding on the engine)

Google's spam policies explicitly cover, among others: **scaled content abuse** (many pages generated mainly to manipulate rankings, however they're produced), **doorway pages** (multiple similar pages or city-swap pages funnelling to one destination), **keyword stuffing**, **hidden text**, **site reputation abuse**, **link schemes**, and fake reviews or misleading structured data. Bing's guidelines prohibit the same practices.

The engine therefore enforces these rules in code, not just in documentation:

1. **No city-swap pages.** Service area is Phoenix plus remote U.S. (owner-confirmed 2026-11-21). Location is expressed honestly on each service page ("based in Phoenix, AZ; working with U.S. clients remotely"). The engine never generates "<service> in <city>" variants.
2. **No page without distinct intent and evidence.** A new page must map to a real service in the catalog, cite verifiable site facts, and pass a cannibalization check against every existing page (§ quality gate in the implementation report).
3. **Unsupported numbers are rejected.** Any figure in generated content must appear in the site's own evidence corpus, or the page fails the gate. This blocks invented statistics, prices and results.
4. **No ratings or review markup.** The site has no third-party review aggregate, so `AggregateRating` and `Review` schema are never emitted. The References section stays visible content, not review markup.
5. **No hidden text.** Admin-only UI remains (needed for in-page editing) but is excluded from snippets with `data-nosnippet`. It isn't keyword content.
6. **Volume cap.** Autonomous article publishing is limited (default 2 per month) and needs an evidence-backed opportunity from real search data. More URLs are never a goal in themselves.

## 5. Local vs. national relevance

- **Local pack / Maps** rankings come from the Google Business Profile: relevance, distance, prominence. The owner manages the GBP (Phase 5 is skipped). The website supports it with consistent NAP (name, address/locality, phone): "Idris's Digital Marketing & Web Design AI Agency", Phoenix, AZ, 480-562-7514, with `ProfessionalService` markup whose `areaServed` is Phoenix and the United States.
- **Organic searches for remote services** ("hire AI engineer", "LLM fine-tuning consultant", "data annotation services") aren't local. They rank on topical relevance, depth, demonstrated experience (E-E-A-T) and links. The project pages, with real live client sites, walkthrough videos and dated experience, are the strongest available evidence and are built as first-class pages.
- **Distance can't be optimised honestly** beyond stating the real location, so the engine doesn't try.

## 6. Prominence (authority): what's legitimate and available

| Lever | Status | Action |
|---|---|---|
| Live client sites (peggylocsanddreads.com, luxebybokeh.com, carescrubsuniforms.com, jezzobhealthcare.org, cadenshealth.com) | Exist | Project pages link to them. A "site by" credit link on client sites is a legitimate, owner-arranged step (listed in the setup checklist, not automated). |
| GitHub (`idrisp1`), LinkedIn | Exist | `sameAs` in Person schema. Social posting plan in Phase 4. |
| Google Business Profile | Exists (owner-managed) | NAP consistency only |
| Directory and citation listings | Unknown | Not automated. A manual citation step is listed in the setup checklist. |
| Paid links, link exchanges, PBNs | — | **Never** (spam policy) |

## 7. Technical audit summary (live measurements)

| Check | Result | Severity | Planned fix |
|---|---|---|---|
| HTTPS, HSTS, HTTP→HTTPS 301 | Pass | — | — |
| `www.` host | 200 duplicate | Medium | 301 to apex |
| `/index.html` | 200 duplicate | Low | 301 to `/` |
| Title | Static, name only | High | Dynamic, intent-matched per page |
| Meta description | 68-char slogan | Medium | 140–160 chars per page from real content |
| H1/H2 | One H1, good H2s | — | Same pattern on new pages |
| Heading order | h2→h4 skips (Education, Reviews) | Low | Left as is: changing tags would alter the existing design. Recorded as a known a11y item. |
| Form labels | Review form inputs lack `for`/`id` association | Low | Add `for` attributes (no visual change) |
| ARIA | `aria-label` on a non-interactive div (`fvwResize`) | Low | Add `role="separator"` (no visual change) |
| Canonical | Present (`/`) | — | Per-page self-canonical |
| Structured data | 2 unlinked blocks; sentence-valued `areaServed`; "Growth.." typo | Medium | Linked `@graph` |
| Sitemap | 1 URL, no `lastmod` | High | Generated from real pages with `lastmod` from version history |
| robots.txt | Allows all | — | Keep search crawlers allowed. Block training crawlers (owner decision). |
| Content in initial HTML | ~296 words | **Critical** | Server-render |
| Internal links | Anchors only | High | Services hub, service ↔ project ↔ article links |
| Images | WebP, alt present | — | Descriptive alt on new pages |
| Core Web Vitals | Lab: LCP 1.4 s, CLS 0, TBT 300 ms (Lighthouse mobile). Field (CrUX): no data, since traffic is too low. | — | Re-measure after changes. Prerendering should *improve* LCP. |
| Broken links | None found among the outbound project links checked | — | Daily automated check |
| 404 page | Plain text | Low | Branded HTML 404 with links (status stays 404) |
| Mobile | Viewport set; Lighthouse mobile passes | — | New pages use the same responsive tokens |
| Server responses | 200 / 404 correct | — | Monitored daily |

## 8. What the implementation must deliver (acceptance criteria derived from this audit)

1. Full primary content in the initial HTML of every public page, with identical client re-render.
2. One canonical host (apex), one canonical URL per page.
3. One page per verified, distinct service intent; project pages as evidence; no doorway variants.
4. Per-page titles and descriptions, a linked JSON-LD graph, a BreadcrumbList on subpages.
5. A sitemap with real `lastmod`, plus IndexNow on every meaningful change.
6. GSC and Bing data persisted daily, so trends and outcomes can be measured.
7. A first-party, cookie-less referral and conversion log covering AI assistants.
8. Spam-policy guardrails enforced in code (quality gate), not just written down.
