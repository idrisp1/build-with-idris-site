# Keyword Coverage Network (Phase 2)

- **Date:** 2026-11-21
- **Machine-readable dataset:** `keyword_data.json` (106 keywords, every one mapped to a target page and a status)
- **Inputs:** the verified service inventory (`reports/initial_website_audit.md` §3) and owner decisions from 2026-11-21: Phoenix plus remote U.S., canonical name "Idris Paul Kwaya", and one header "Services" link.

The network links four dimensions: **S** (Services), **L** (Locations genuinely served), **I** (search Intents) and **P** (customer Problems). A page exists only where an S has evidence, and the I/P combination is distinct from every other page's.

---

## 1. Dimensions

### S: services (verified only)
| ID | Service | Source of truth | Evidence on site |
|---|---|---|---|
| S1 | Website Design & Development (incl. e-commerce, booking, redesign, maintenance) | Agency category 2 | Peggy's Locs and Dreads, Luxe By Bokeh, CareScrubs, JEZZOB site |
| S2 | Custom Software & Backend Development (APIs, cloud, HIPAA) | Freelance engineering, experience | JEZZOB platform, Cadens backend, Dawn Podcast, Lambda/SQS fintech work |
| S3 | AI Development (LLM apps, chatbots, agents, fine-tuning, MLOps) | AI Systems section, freelance | MTN chatbot, self-built AI IDE (video), RunPod training dashboard (video) |
| S4 | Business Process Automation & AI Solutions | Agency category 7 | Cadens Twilio SMS/email workflows, MTN automation analysis |
| S5 | SEO, Digital Marketing & Business Research | Agency categories 1, 3, 6 | Service listings; this site's own SEO engine (no client results claimed) |
| S6 | Document Processing & Data Management | Agency category 5 | Service listing (performed by the owner's local app) |
| S7 | AI Data Annotation & Evaluation | Agency category 4 | Service listing; model-training work (video) |

### L: locations
| ID | Location | Basis | How it's used |
|---|---|---|---|
| L1 | Phoenix, AZ and surrounding areas | Site content + owner | Stated on every service page; `areaServed` City |
| L2 | Remote, anywhere in the U.S. | Owner-confirmed 2026-11-21 | Stated on every service page; `areaServed` Country |
| — | International | Owner said no | Not targeted |
| — | Individual suburbs (Chandler, Scottsdale, Mesa…) | — | **No city pages.** That would be doorway content. |

### I: intents
I1 hire/transactional · I2 compare/evaluate · I3 local find · I4 learn/informational · I5 price research · I6 problem-solving

### P: customer problems (each tied to evidence)
| ID | Problem | Service | Evidence |
|---|---|---|---|
| P1 | "Clients book by phone/DM; I need online booking + an admin I can run myself" | S1 | Peggy's platform |
| P2 | "I need an online store that takes payments reliably" | S1 | CareScrubs (Stripe, webhooks), Luxe By Bokeh |
| P3 | "My site is slow / outdated / has broken links" | S1, S5 | CareScrubs FCP improvement; maintenance service |
| P4 | "I handle patient/health data and need secure, role-based software" | S2 | JEZZOB HIPAA platform, JWT/RBAC |
| P5 | "Our API/backend is slow or doesn't scale" | S2 | 820 ms→310 ms Redis caching; Lambda/SQS 50K+/mo |
| P6 | "Support volume is too high; we want an AI assistant" | S3 | MTN chatbot, −35% tier-1 handle time |
| P7 | "We want AI inside our product (LLM features, agents)" | S3 | Self-built AI IDE, multi-provider routing |
| P8 | "We need a model fine-tuned or deployed on GPUs" | S3 | RunPod training dashboard |
| P9 | "Staff waste hours on reminders, follow-ups, data shuffling" | S4 | Cadens SMS/email automation |
| P10 | "Customers can't find us online" | S5 | SEO audits, local SEO, keyword research |
| P11 | "We get stacks of PDFs/invoices that someone retypes" | S6 | PDF extraction, invoice processing |
| P12 | "Our ML team needs labelled training data or response evaluation" | S7 | Annotation services |

---

## 2. Page architecture (decided from evidence, not from keyword count)

### Decision rules applied to every candidate page
A dedicated page was created only if **all** of these hold:
1. The service is verified (S1–S7).
2. The intent is distinct, meaning a different searcher with a different job to be done, not a synonym.
3. The page can carry unique, evidence-backed content.
4. No existing or planned page already serves that intent (no cannibalization).
5. There's a realistic contact or hire conversion.

### Final architecture: 1 hub + 7 service pages + project pages

| URL | Primary keyword | Secondary keywords | Intent | Target customer | Problems | Geo | Conversion |
|---|---|---|---|---|---|---|---|
| `/services` (hub) | AI and web development services Phoenix | services by Idris Paul Kwaya | I2 | Anyone comparing what's offered | all | L1+L2 | Route to the right service page |
| `/services/website-design-development` | website design Phoenix | web developer Phoenix, website redesign, booking website, e-commerce website development, website maintenance | I1, I3 | Small/local business owners | P1, P2, P3 | L1+L2 | Contact form |
| `/services/custom-software-development` | custom software development Phoenix | backend developer, API development, HIPAA-compliant software, AWS Lambda developer, healthcare software developer | I1, I2 | Startups, healthcare orgs, ops-heavy businesses | P4, P5 | L1+L2 | Contact form |
| `/services/ai-development` | AI developer Phoenix / hire AI engineer | custom AI chatbot development, LLM integration, AI agent development, Copilot Studio developer, LLM fine-tuning | I1 | Companies adding AI to products/support | P6, P7, P8 | L1+L2 | Contact form |
| `/services/ai-automation` | AI automation for small businesses | business process automation, workflow automation, automate repetitive tasks, SMS appointment reminders | I1, I6 | Small business owners and operators | P9 | L1+L2 | Contact form |
| `/services/seo-digital-marketing` | SEO services Phoenix | local SEO, SEO audit, digital marketing Phoenix, Google Ads management, competitor research, lead generation | I1, I3 | Local businesses wanting visibility | P10 | L1+L2 | Contact form |
| `/services/document-processing` | PDF data extraction service | invoice processing, PDF to Excel conversion, data entry, data cleaning | I1, I6 | Back-office teams, accountants, SMBs | P11 | L2 | Contact form |
| `/services/ai-data-annotation` | data annotation services | image annotation, bounding-box labeling, text classification, NER, audio transcription, AI response evaluation | I1 | ML teams and AI startups | P12 | L2 | Contact form |
| `/projects/<id>` (one per real project; 7 today) | project-specific long tail (e.g. "hair salon booking platform", "HIPAA patient intake platform") | technologies used | I2, I4 | Evaluators checking proof | per project | — | Link to related service + contact |

**Why these are separate rather than merged**
- *AI development vs AI automation.* The first is a technical buyer hiring an engineer to build AI into a product ("hire AI engineer", "LLM integration"). The second is a business owner who wants hours back ("automate repetitive tasks"). Different vocabulary, different proof, different questions. Both pages cross-link: "custom agents" on the automation page points to the AI development page instead of repeating it.
- *Website vs custom software.* "Website design Phoenix" searchers want a marketing or booking site. "Custom software / backend developer" searchers want an application, an API or compliance-sensitive systems. Evidence differs (Peggy/Bokeh vs JEZZOB/Cadens/Lambda).
- *Document processing vs data annotation.* Different buyers (an accounts-payable clerk vs an ML team), different deliverables (spreadsheets vs labelled datasets).

**Consolidated instead of split**
| Candidate | Decision | Reason |
|---|---|---|
| E-commerce website development | Section inside the website page | Same buyer and process as website design. A separate page would split relevance between two pages. |
| Website redesign / maintenance | Sections inside the website page | Same service category, same buyer |
| Google Ads / paid advertising | Section inside the SEO & Digital Marketing page | A real service, but there's no case evidence yet, so a standalone page would be thin. Becomes an expansion opportunity when evidence exists. |
| Business Research & Intelligence | Section inside the SEO & Digital Marketing page | Low distinct demand. Overlaps with competitor research and lead generation. |
| Chatbots vs agents vs fine-tuning | One AI development page with sections | Same hiring intent. Splitting them would create three thin pages. |

**Rejected**
- City pages (Chandler, Scottsdale, Mesa): doorway risk. Phoenix plus remote U.S. is stated honestly instead.
- WordPress, Shopify, mobile apps, social media management: not evidenced (status `requires-evidence`). Created only if the owner confirms the service and provides evidence.
- Forex trading bot as a service: not offered, and compliance risk.
- International outsourcing: outside the confirmed service area.

### Informational demand → research briefs, not service pages
Problem and question keywords (Categories D, E, I, J and part of K) map to **articles you can write**, each linking to exactly one service page. The engine doesn't write them (owner decision, 2026-11-21: no LLM). It produces a **research brief** for each topic once search data shows demand. Initial backlog, all marked `expansion-opportunity` in the dataset:

| Article topic | Links to | Evidence it can draw on | Constraint |
|---|---|---|---|
| What affects website development cost | website page | Project scopes | **No prices** unless the owner supplies them |
| Custom website vs website builder | website page | Peggy/Bokeh admin CMS | — |
| How to improve website performance | website page | CareScrubs sub-2-second mobile FCP | Only cite verified figures |
| How a small business can automate repetitive tasks | automation page | Cadens SMS/email automation | — |
| AI automation vs manual workflows | automation page | MTN ticket analysis (70–80% automatable) | — |
| Custom AI application vs off-the-shelf software | AI page | AI IDE, MTN chatbot | — |
| Copilot Studio vs custom chatbot | AI page | MTN deployment | — |
| Fine-tuning a small language model on RunPod | AI page | Training dashboard demo | Describe only what the demo shows |
| Is my website HIPAA compliant? (what to check) | software page | JEZZOB RBAC, third-party HIPAA review | No legal advice; no compliance guarantees |
| Stripe webhooks and idempotent order handling | software page | CareScrubs | — |
| Why is my website not showing on Google? | SEO page | This site's own audit | — |
| SEO vs Google Ads for a small business | SEO page | Service descriptions | — |
| How to extract data from PDFs into Excel | document page | Service description | — |
| What is data annotation? | annotation page | Service description | — |

Nothing is published automatically. When a topic gets at least 10 observed impressions (GSC or Bing), the content agent saves a research brief to the admin panel. The brief contains the query, demand, existing coverage, the site facts you can use, related projects and a suggested outline, so you can decide whether to write it.

---

## 3. Internal linking map

```
/ (home) ── nav "Services" ──► /services ──► each /services/<slug>
   │                                            │  ▲
   │ project cards "Case study" ───────────────►│  │ "Proof" cards
   ▼                                            ▼  │
/projects/<id> ── "Related service" ──────► /services/<slug>
/insights/<slug> (articles) ── exactly one primary service link + related projects
/services/<slug> ── auto-lists related articles once they exist
All pages ── CTA ──► /#contact
```
Links are generated from one mapping (`backend/seo_engine/catalog.js`), so adding a project or an article updates every related page automatically. Nobody has to maintain the links by hand.

## 4. Cannibalization guard
Each keyword in `keyword_data.json` has exactly one `targetUrl`. The quality gate rejects any new page whose primary keyword or title overlaps an existing page's primary or secondary keywords above the similarity threshold. The performance analyzer flags real cannibalization when GSC shows two URLs earning impressions for the same query.
