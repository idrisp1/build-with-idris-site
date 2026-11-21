# Keyword Universe (Phase 3)

- **Date:** 2026-11-21
- **Dataset:** `keyword_data.json`, the authoritative copy. The tables below are generated from it.
- **Existing research found:** the repo had no keyword files. The only prior keyword source is the live Search Console panel (`backend/lib/searchConsole.js`), which shows top queries but stored nothing. From its first run, the keyword intelligence agent imports real GSC and Bing queries into the persisted dataset, so observed data gradually replaces the estimates below.

## Honesty about the numbers
- **Search volume, trend and keyword difficulty are `null` for every keyword.** No keyword-volume API is connected, and I didn't invent figures.
- **Demand (D) is an estimated tier (1–5)** based on query shape: head terms 4–5, mid-tail 2–3, long-tail and local 1–2. Every record carries `demandSource: "estimate …"`.
- Once Search Console and Bing Webmaster data are being collected, the keyword intelligence agent writes **measured** impressions, clicks and position next to the estimate. It recomputes D from log-scaled impressions, and Bing's keyword research methods (`GetKeyword`, `GetRelatedKeywords`, JSON endpoint) can supply real Bing impression counts. The estimate is kept, so you can compare estimated and measured values.

## Scoring model (reproducible)

```
Opportunity Score = round( D × R × C × F / 625 × 100 )      each factor integer 1–5, max 100
D  Search demand tier           (estimate now, measured later)
R  Business relevance           5 = offered + project evidence … 1 = not offered
C  Conversion potential         transactional/local high … informational low
F  Ranking feasibility          long-tail/local/evidence-specific high … national head terms low
```
Multiplying (rather than adding) means a zero-relevance keyword can't score high just because demand is huge. That keeps "WordPress developer", with its high demand and no evidence, out of the plan.

## Summary

| Status | Count | Meaning |
|---|---|---|
| missing-page | 70 | Served by a page created in this implementation (service or project page) |
| expansion-opportunity | 20 | Informational demand → research briefs for you (the agent doesn't write articles) |
| requires-evidence | 7 | Plausible, but not supported by site evidence (pricing, WordPress, Shopify, mobile, social media management) |
| not-relevant | 5 | City-swap variants, forex bot, international, trivia |
| consolidation-opportunity | 2 | Folded into a broader page (e-commerce, business research) |
| existing-page | 2 | Already served by the homepage (personal-brand queries) |

**Top opportunities** (score ≥ 29): web developer phoenix (36), website design phoenix (36), custom ai chatbot development (36), website redesign services (36), web developer near me (32), ai developer phoenix (32), hire web developer (32), booking website development (32), microsoft copilot studio developer (32), business process automation services (29), ai automation for small businesses (29), automate repetitive business tasks (29).

They point at the website, AI development and automation pages first. The implementation builds those with the most evidence and FAQs.

## The universe by category

### Category A: Primary service

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| business process automation services | commercial | US | 3·5·4·3 | 29 | `/services/ai-automation` | missing-page |
| data annotation services | commercial | US | 3·4·4·3 | 23 | `/services/ai-data-annotation` | missing-page |
| document processing services | commercial | US | 3·4·4·3 | 23 | `/services/document-processing` | missing-page |
| seo consultant | commercial | US | 4·4·4·2 | 20 | `/services/seo-digital-marketing` | missing-page |
| ai systems engineer | navigational/commercial | US | 2·5·3·4 | 19 | `/` | existing-page |
| ai developer | commercial | US | 4·5·3·2 | 19 | `/services/ai-development` | missing-page |
| website designer | commercial | US | 5·5·4·1 | 16 | `/services/website-design-development` | missing-page |
| backend developer | commercial | US | 4·4·3·2 | 15 | `/services/custom-software-development` | missing-page |
| digital marketing agency | commercial | US | 5·4·4·1 | 13 | `/services/seo-digital-marketing` | missing-page |
| web developer | commercial | US | 5·5·3·1 | 12 | `/services/website-design-development` | missing-page |
| business research services | commercial | US | 2·3·3·3 | 9 | `/services/seo-digital-marketing` | consolidation-opportunity — Business Research & Intelligence is a real service but has low distinct demand; consolidated into the SEO & Digital Marketing page (competitor/market research, lead generation) instead of a thin standalone page. |
| ai engineer | informational/commercial | US | 5·5·2·1 | 8 | `/services/ai-development` | missing-page |
| software developer | commercial | US | 5·4·2·1 | 6 | `/services/custom-software-development` | missing-page |
| social media management services | commercial | US | 4·2·4·1 | 5 | — | requires-evidence — Mentioned in the agency description ("social media content") but not in any of the 7 service categories. |

### Category B: Local intent

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| web developer phoenix | local-commercial | Phoenix | 3·5·5·3 | 36 | `/services/website-design-development` | missing-page |
| website design phoenix | local-commercial | Phoenix | 3·5·5·3 | 36 | `/services/website-design-development` | missing-page |
| web developer near me | local-commercial | Phoenix | 4·5·5·2 | 32 | `/services/website-design-development` | missing-page — Near-me queries are resolved mostly by the Google Business Profile; the page supports it with consistent NAP. |
| ai developer phoenix | local-commercial | Phoenix | 2·5·5·4 | 32 | `/services/ai-development` | missing-page |
| custom software development phoenix | local-commercial | Phoenix | 2·5·5·3 | 24 | `/services/custom-software-development` | missing-page |
| software developer phoenix az | local-commercial | Phoenix | 2·5·4·3 | 19 | `/services/custom-software-development` | missing-page |
| seo services phoenix | local-commercial | Phoenix | 3·4·5·2 | 19 | `/services/seo-digital-marketing` | missing-page |
| ai automation phoenix | local-commercial | Phoenix | 1·5·5·4 | 16 | `/services/ai-automation` | missing-page |
| digital marketing phoenix | local-commercial | Phoenix | 3·4·4·2 | 15 | `/services/seo-digital-marketing` | missing-page |
| local seo phoenix | local-commercial | Phoenix | 2·4·5·2 | 13 | `/services/seo-digital-marketing` | missing-page |
| website design chandler az | local-commercial | Chandler | 2·3·4·3 | 12 | — | not-relevant — Covered by "Phoenix and surrounding areas" copy; a separate city page would be a doorway page. |
| website design scottsdale | local-commercial | Scottsdale | 2·3·4·2 | 8 | — | not-relevant — Same: no city-swap pages. |

### Category C: Commercial intent

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| custom ai chatbot development | commercial | US | 3·5·5·3 | 36 | `/services/ai-development` | missing-page |
| website redesign services | commercial | US | 3·5·5·3 | 36 | `/services/website-design-development` | missing-page |
| hire web developer | transactional | US | 4·5·5·2 | 32 | `/services/website-design-development` | missing-page |
| booking website development | commercial | US | 2·5·5·4 | 32 | `/services/website-design-development` | missing-page |
| hire ai developer | transactional | US | 3·5·5·2 | 24 | `/services/ai-development` | missing-page |
| hire ai engineer | transactional | US | 3·5·5·2 | 24 | `/services/ai-development` | missing-page |
| llm integration services | commercial | US | 2·5·5·3 | 24 | `/services/ai-development` | missing-page |
| ai agent development | commercial | US | 3·5·5·2 | 24 | `/services/ai-development` | missing-page |
| hipaa compliant software development | commercial | US | 2·5·5·3 | 24 | `/services/custom-software-development` | missing-page |
| website maintenance services | commercial | US | 3·4·4·3 | 23 | `/services/website-design-development` | missing-page |
| seo audit service | commercial | US | 3·4·4·3 | 23 | `/services/seo-digital-marketing` | missing-page |
| image annotation services | commercial | US | 3·4·4·3 | 23 | `/services/ai-data-annotation` | missing-page |
| ecommerce website development | commercial | US | 4·4·4·2 | 20 | `/services/website-design-development` | consolidation-opportunity — E-commerce builds (CareScrubs, Luxe By Bokeh) are covered inside the website page; a separate page would compete with it. |
| pdf data extraction service | commercial | US | 2·4·4·4 | 20 | `/services/document-processing` | missing-page |
| hire backend developer | transactional | US | 3·4·5·2 | 19 | `/services/custom-software-development` | missing-page |
| professional website development | commercial | US | 3·5·4·2 | 19 | `/services/website-design-development` | missing-page |
| custom software development | commercial | US | 5·5·4·1 | 16 | `/services/custom-software-development` | missing-page |
| invoice processing service | commercial | US | 2·4·4·3 | 15 | `/services/document-processing` | missing-page |
| google ads management | commercial | US | 4·3·4·1 | 8 | `/services/seo-digital-marketing` | missing-page — Paid-ads management is a listed agency service; covered as a section, not its own page, until there is case evidence. |
| international web development outsourcing | commercial | International | 3·1·3·1 | 1 | — | not-relevant — Owner confirmed service area is Phoenix + remote U.S. only. |

### Category D: Price intent

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| website development cost | informational/price | US | 4·4·3·2 | 15 | research brief | expansion-opportunity — Article explaining cost factors only. No prices are published unless the owner provides them. |
| how much does a small business website cost | informational/price | US | 4·4·3·2 | 15 | research brief | expansion-opportunity — Same constraint: factors, not invented numbers. |
| ai automation pricing | informational/price | US | 2·5·3·3 | 14 | research brief | requires-evidence — Needs owner-provided pricing or pricing model before any page can address it. |
| custom software development cost | informational/price | US | 3·4·3·2 | 12 | research brief | requires-evidence — Same: no published pricing exists. |
| seo services cost | informational/price | US | 3·4·3·2 | 12 | research brief | requires-evidence |

### Category E: Problem-based

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| how to automate business processes | informational | US | 3·5·3·3 | 22 | research brief | expansion-opportunity |
| automate appointment reminders sms | informational/commercial | US | 2·4·4·4 | 20 | `/projects/cadens` | missing-page — Cadens project (Twilio SMS/email workflows) is direct evidence. |
| reduce customer support tickets with ai chatbot | informational | US | 2·5·3·4 | 19 | `/projects/mtn` | missing-page — MTN project: 35% tier-1 handle-time reduction is verified site content. |
| why is my website not showing on google | informational | US | 3·4·3·3 | 17 | research brief | expansion-opportunity |
| how to build an ai powered application | informational | US | 3·5·2·2 | 10 | research brief | expansion-opportunity |
| how to improve website performance | informational | US | 4·4·2·2 | 10 | research brief | expansion-opportunity — Evidence: CareScrubs sub-2-second mobile FCP, 45% improvement. |
| how to extract data from pdf to excel | informational | US | 4·4·2·2 | 10 | research brief | expansion-opportunity |
| fix broken links on website | informational | US | 3·3·3·2 | 9 | research brief | expansion-opportunity |

### Category F: Industry-specific

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| ai automation for small businesses | commercial | US | 3·5·4·3 | 29 | `/services/ai-automation` | missing-page |
| healthcare software developer | commercial | US | 2·5·5·3 | 24 | `/services/custom-software-development` | missing-page — Evidence: JEZZOB and Cadens projects. |
| website for hair salon booking | commercial | US | 2·4·4·4 | 20 | `/projects/peggy` | missing-page |
| software development for startups | commercial | US | 3·4·4·2 | 15 | `/services/custom-software-development` | missing-page |
| fintech backend development | commercial | US | 2·4·4·3 | 15 | `/services/custom-software-development` | missing-page — Evidence: 50K+ monthly transactions, 99.97% uptime fintech client. |
| behavioral health patient intake software | commercial | US | 1·4·4·4 | 10 | `/projects/jezzob` | missing-page |
| boutique clothing ecommerce website | commercial | US | 1·4·4·4 | 10 | `/projects/bokeh` | missing-page |
| medical apparel ecommerce | commercial | US | 1·3·3·4 | 6 | `/projects/carescrubs` | missing-page |

### Category G: Platform-specific

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| microsoft copilot studio developer | commercial | US | 2·5·5·4 | 32 | `/services/ai-development` | missing-page — Evidence: MTN Cameroon deployment. |
| stripe integration developer | commercial | US | 2·4·5·3 | 19 | `/services/website-design-development` | missing-page |
| node.js developer | commercial | US | 4·4·3·2 | 15 | `/services/custom-software-development` | missing-page |
| api development services | commercial | US | 3·4·4·2 | 15 | `/services/custom-software-development` | missing-page |
| aws lambda developer | commercial | US | 2·4·4·3 | 15 | `/services/custom-software-development` | missing-page |
| twilio developer | commercial | US | 2·4·4·3 | 15 | `/services/ai-automation` | missing-page |
| webrtc developer | commercial | US | 2·3·3·3 | 9 | `/projects/dawnpodcast` | missing-page |
| react developer | commercial | US | 4·3·3·1 | 6 | `/services/website-design-development` | missing-page |
| python developer | commercial | US | 4·3·3·1 | 6 | `/services/custom-software-development` | missing-page — Python is used (Flask project, AI work) but secondary; mentioned, not targeted with its own page. |
| wordpress developer | commercial | US | 5·2·4·1 | 6 | — | requires-evidence — No WordPress work is shown anywhere on the site. Not targeted unless the owner confirms it. |
| runpod fine tuning | informational | US | 1·4·2·4 | 5 | `/services/ai-development` | missing-page — Evidence: self-built RunPod training dashboard (video). |
| shopify developer | commercial | US | 4·2·4·1 | 5 | — | requires-evidence — Same: no Shopify evidence; the e-commerce builds are custom Express/React + Stripe. |
| mobile app developer | commercial | US | 5·1·4·1 | 3 | — | requires-evidence — No mobile app projects on the site. |

### Category H: Outcome-based

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| automate repetitive business tasks | commercial | US | 3·5·4·3 | 29 | `/services/ai-automation` | missing-page |
| turn pdfs into spreadsheets automatically | commercial | US | 2·4·4·4 | 20 | `/services/document-processing` | missing-page |
| develop custom ai applications | commercial | US | 2·5·4·3 | 19 | `/services/ai-development` | missing-page |
| label training data for machine learning | commercial | US | 2·4·4·3 | 15 | `/services/ai-data-annotation` | missing-page |
| build scalable backend systems | commercial | US | 2·4·3·3 | 12 | `/services/custom-software-development` | missing-page |
| get more customers from website | informational/commercial | US | 3·4·3·2 | 12 | `/services/seo-digital-marketing` | missing-page |

### Category I: Comparison

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| ai automation vs manual workflows | informational | US | 2·5·3·4 | 19 | research brief | expansion-opportunity |
| custom ai application vs off the shelf software | informational | US | 2·5·3·4 | 19 | research brief | expansion-opportunity |
| custom website vs website builder | informational | US | 3·4·3·3 | 17 | research brief | expansion-opportunity |
| seo vs google ads for small business | informational | US | 3·4·3·3 | 17 | research brief | expansion-opportunity |
| copilot studio vs custom chatbot | informational | US | 2·4·3·4 | 15 | research brief | expansion-opportunity |
| serverless vs containers for small apps | informational | US | 2·3·2·3 | 6 | research brief | expansion-opportunity — Evidence: Lambda/SQS and Docker/EC2 experience. |

### Category J: Questions / informational

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| how can a business automate repetitive tasks | informational | US | 3·5·3·3 | 22 | `/services/ai-automation` | missing-page — Answered as an FAQ on the automation page; an article only if GSC shows separate demand. |
| what is an ai systems engineer | informational | US | 2·5·2·4 | 13 | `/` | existing-page |
| is my website hipaa compliant | informational | US | 2·4·3·3 | 12 | research brief | expansion-opportunity |
| what is data annotation | informational | US | 3·4·2·2 | 8 | research brief | expansion-opportunity |
| what does an ai engineer do | informational | US | 4·4·1·2 | 5 | research brief | expansion-opportunity |
| what is indexnow | informational | US | 2·1·1·3 | 1 | — | not-relevant — Technical SEO trivia; doesn't serve a customer need. |

### Category K: Long-tail

| Keyword | Intent | Geo | D·R·C·F | Score | Target | Status |
|---|---|---|---|---|---|---|
| hire ai engineer to build custom chatbot for customer support | transactional | US | 1·5·5·5 | 20 | `/services/ai-development` | missing-page |
| phoenix web developer for small business booking system | local-commercial | Phoenix | 1·5·5·5 | 20 | `/services/website-design-development` | missing-page |
| hipaa compliant patient intake platform developer | commercial | US | 1·5·5·5 | 20 | `/services/custom-software-development` | missing-page |
| convert invoices to excel automatically for small business | commercial | US | 1·4·5·5 | 16 | `/services/document-processing` | missing-page |
| fine tune small language model on runpod gpu | informational | US | 1·4·2·5 | 6 | research brief | expansion-opportunity |
| aws lambda sqs event driven architecture example | informational | US | 1·3·1·4 | 2 | research brief | expansion-opportunity |
| stripe webhook order confirmation idempotency | informational | US | 1·3·1·4 | 2 | research brief | expansion-opportunity — Evidence: CareScrubs idempotent transaction handling. |
| forex trading bot development | commercial | US | 2·1·2·2 | 1 | — | not-relevant — The GBP/USD bot is the owner's own startup, not a client service; financial-compliance risk. |
