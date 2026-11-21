// Autonomous content agent.
//  1. Title experiments: for pages with high impressions but CTR well below what
//     their position predicts, propose ONE new title (one variable at a time),
//     record a baseline, and evaluate after a fixed window with a significance
//     test; worse results are rolled back automatically.
//  2. Articles: when real search data (GSC/Bing) shows informational demand that
//     maps to a verified service and no page covers it, draft an evidence-bound
//     article, fact-check it with an independent pass, run the mandatory quality
//     gate, and publish only if every check passes. Failures become drafts with
//     reasons. Volume is capped per month.
import { config } from '../config.js';
import { SERVICE_BY_SLUG, SERVICES } from '../catalog.js';
import { readJson, appendJsonl, readJsonl, listFiles } from '../store.js';
import { loadSite, evidenceFacts } from '../evidence.js';
import { getPage, savePageVersion, setPageStatus, currentData, listPages } from '../pages.js';
import { addExperiment, listExperiments, updateExperiment, changeTypeWeight, recordChange } from '../learning.js';
import { homeMeta } from '../render/home.js';
import { servicesHubMeta, serviceMeta, projectMeta, findProjectBySlug, publishedArticles } from '../render/pages.js';
import { pageMetrics } from './performanceAnalyzer.js';
import { checkArticle, checkMeta, articleText } from './qualityGate.js';
import * as claude from '../integrations/claude.js';

const EXPERIMENT_WINDOW_DAYS = 28;
const RECRAWL_GRACE_DAYS = 4;
const MAX_EXPERIMENT_DAYS = 56;
const MIN_IMPRESSIONS = 200;

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function latestDataDay() {
  const files = listFiles('gsc/daily').filter((f) => f.endsWith('.json'));
  return files.length ? files.at(-1).slice(0, 10) : null;
}

export function pageForPath(path, site) {
  if (path === '/') return { pageId: 'page:home', meta: homeMeta(site) };
  if (path === '/services') return { pageId: 'page:services', meta: servicesHubMeta() };
  let m = path.match(/^\/services\/([a-z0-9-]+)$/);
  if (m && SERVICE_BY_SLUG[m[1]]) return { pageId: `service:${m[1]}`, meta: serviceMeta(SERVICE_BY_SLUG[m[1]]), service: SERVICE_BY_SLUG[m[1]] };
  m = path.match(/^\/projects\/([a-z0-9-]+)$/);
  if (m) { const p = findProjectBySlug(site, m[1]); if (p) return { pageId: `project:${m[1]}`, meta: projectMeta(site, p) }; }
  m = path.match(/^\/insights\/([a-z0-9-]+)$/);
  if (m) { const rec = getPage(`article:${m[1]}`); const d = currentData(rec); if (d) return { pageId: `article:${m[1]}`, meta: { title: d.title, metaDescription: d.metaDescription }, article: true }; }
  return null;
}

// ---------------- statistics ----------------
export function twoProportionZ(c1, n1, c2, n2) {
  if (!n1 || !n2) return 0;
  const p1 = c1 / n1; const p2 = c2 / n2; const p = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se ? (p2 - p1) / se : 0;
}

export function evaluate(baseline, post) {
  if (baseline.impressions < MIN_IMPRESSIONS || post.impressions < MIN_IMPRESSIONS) return { verdict: 'insufficient-data' };
  if (baseline.position && post.position && Math.abs(post.position - baseline.position) > 2) {
    return { verdict: 'confounded', note: 'average position moved by more than 2; CTR change cannot be attributed to the title' };
  }
  const z = twoProportionZ(baseline.clicks, baseline.impressions, post.clicks, post.impressions);
  const ctrDelta = post.ctr - baseline.ctr;
  if (z >= 1.96) return { verdict: 'improved', z, ctrDelta };
  if (z <= -1.96) return { verdict: 'worsened', z, ctrDelta };
  return { verdict: 'no-significant-change', z, ctrDelta };
}

// ---------------- experiments ----------------
export async function evaluateExperiments({ now = new Date() } = {}) {
  const lastDay = latestDataDay();
  const results = [];
  for (const exp of listExperiments().filter((e) => e.status === 'running')) {
    const start = exp.startedAt.slice(0, 10);
    const postFrom = addDays(start, RECRAWL_GRACE_DAYS);
    const postTo = addDays(postFrom, EXPERIMENT_WINDOW_DAYS - 1);
    if (!lastDay || lastDay < postTo) { results.push({ id: exp.id, status: 'waiting', until: postTo }); continue; }
    const post = pageMetrics(exp.path, postFrom, postTo);
    let ev = evaluate(exp.baseline, post);
    const ageDays = (now - new Date(exp.startedAt)) / 86400000;
    if (ev.verdict === 'insufficient-data' && ageDays < MAX_EXPERIMENT_DAYS) { results.push({ id: exp.id, status: 'waiting-for-impressions' }); continue; }
    let status;
    if (ev.verdict === 'improved') status = 'kept';
    else if (ev.verdict === 'worsened') {
      status = 'reverted';
      const page = getPage(exp.pageId);
      if (exp.previousData) savePageVersion(exp.pageId, { kind: page.kind, data: exp.previousData, by: 'content-agent', reason: `Experiment ${exp.id} reverted: CTR fell significantly (z=${ev.z.toFixed(2)})`, changeType: 'experiment-revert', experimentId: exp.id });
      else setPageStatus(exp.pageId, 'archived', { by: 'content-agent', reason: `Experiment ${exp.id} reverted to default metadata` });
    } else {
      status = 'inconclusive';
      ev = { ...ev, verdict: ev.verdict === 'no-significant-change' ? 'inconclusive' : ev.verdict };
    }
    updateExperiment(exp.id, { status, endedAt: now.toISOString(), post, evaluation: ev });
    results.push({ id: exp.id, status, evaluation: ev });
  }
  return results;
}

const TITLE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'rationale'],
  properties: { title: { type: 'string' }, rationale: { type: 'string' } }
};

async function proposeTitle(site, target, finding, queries) {
  const facts = evidenceFacts(site).slice(0, 200);
  return claude.generateJson({
    purpose: 'title-experiment',
    schema: TITLE_SCHEMA,
    effort: 'medium',
    maxTokens: 4000,
    system: 'You write search result titles for a professional services website. You never invent facts, prices, guarantees, rankings, numbers or credentials. Every factual element of a title must be supported by the evidence provided.',
    user: JSON.stringify({
      task: 'Propose ONE replacement <title> for this page that better matches what searchers are looking for, to raise click-through rate. 35-60 characters. Keep the page topic and location accurate. Include the most important query naturally if it fits. Do not use clickbait, all-caps, emoji, prices or superlatives.',
      page: { path: finding.path, currentTitle: target.meta.title, metaDescription: target.meta.metaDescription },
      searchPerformanceLast28Days: { impressions: finding.impressions, clicks: finding.clicks, ctr: finding.ctr, averagePosition: finding.position },
      topQueriesForThisPage: queries,
      evidence: facts
    })
  });
}

export async function runTitleExperiments({ site, performance, maxNew = 1 }) {
  const out = [];
  if (!claude.isConfigured()) return [{ status: 'skipped', reason: 'ANTHROPIC_API_KEY not set' }];
  if (changeTypeWeight('meta-title') < 0.5) return [{ status: 'skipped', reason: 'learned: title changes have not been improving CTR on this site; paused' }];
  const running = new Set(listExperiments().filter((e) => e.status === 'running').map((e) => e.pageId));
  const recent = new Set(listExperiments().filter((e) => e.endedAt && Date.now() - Date.parse(e.endedAt) < 30 * 86400000).map((e) => e.pageId));
  const pairs = performance?.findings?.lowCtr || [];
  for (const finding of pairs) {
    if (out.filter((o) => o.status === 'started').length >= maxNew) break;
    const target = pageForPath(finding.path, site);
    if (!target || running.has(target.pageId) || recent.has(target.pageId)) continue;
    const queries = []; // top queries for this page from the latest daily files
    for (const f of listFiles('gsc/daily').slice(-28)) {
      for (const r of readJson(`gsc/daily/${f}`, {}).pageQuery || []) if (r.page === finding.page) queries.push({ q: r.query, i: r.impressions, pos: r.position });
    }
    const top = Object.values(queries.reduce((m, r) => { const a = (m[r.q] ||= { query: r.q, impressions: 0 }); a.impressions += r.i; return m; }, {})).sort((a, b) => b.impressions - a.impressions).slice(0, 10);
    let proposal;
    try { proposal = await proposeTitle(site, target, finding, top); } catch (err) { out.push({ path: finding.path, status: 'error', error: err.message }); break; }
    const gate = checkMeta({ title: proposal.title }, { site });
    if (!gate.passed || proposal.title === target.meta.title) {
      appendJsonl('history/rejected-changes.jsonl', { at: new Date().toISOString(), pageId: target.pageId, type: 'meta-title', proposal, gate });
      out.push({ path: finding.path, status: 'rejected-by-gate', gate });
      continue;
    }
    const baselineTo = latestDataDay();
    const baseline = pageMetrics(finding.path, addDays(baselineTo, -(EXPERIMENT_WINDOW_DAYS - 1)), baselineTo);
    const existing = getPage(target.pageId);
    const previousData = existing && existing.status === 'published' ? currentData(existing) : null;
    const exp = addExperiment({ pageId: target.pageId, path: finding.path, type: 'meta-title', variable: 'title', before: target.meta.title, after: proposal.title, rationale: proposal.rationale, baseline, previousData });
    if (target.article) {
      const rec = getPage(target.pageId);
      savePageVersion(target.pageId, { kind: 'article', data: { ...currentData(rec), title: proposal.title }, by: 'content-agent', reason: `Title experiment ${exp.id}: low CTR (${(finding.ctr * 100).toFixed(1)}% at position ${finding.position.toFixed(1)})`, changeType: 'meta-title', experimentId: exp.id });
    } else {
      savePageVersion(target.pageId, { kind: 'override', status: 'published', data: { ...(previousData || {}), title: proposal.title }, by: 'content-agent', reason: `Title experiment ${exp.id}: low CTR (${(finding.ctr * 100).toFixed(1)}% at position ${finding.position.toFixed(1)})`, changeType: 'meta-title', experimentId: exp.id });
    }
    out.push({ path: finding.path, status: 'started', experimentId: exp.id, title: proposal.title });
  }
  return out;
}

// ---------------- articles ----------------
const ARTICLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'metaDescription', 'h1', 'slug', 'primaryKeyword', 'secondaryKeywords', 'serviceSlug', 'summary', 'sections', 'faqs', 'relatedProjects', 'claims'],
  properties: {
    title: { type: 'string' }, metaDescription: { type: 'string' }, h1: { type: 'string' }, slug: { type: 'string' },
    primaryKeyword: { type: 'string' }, secondaryKeywords: { type: 'array', items: { type: 'string' } },
    serviceSlug: { type: 'string', enum: SERVICES.map((s) => s.slug) }, summary: { type: 'string' },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heading', 'paragraphs', 'bullets'], properties: { heading: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } }, bullets: { type: 'array', items: { type: 'string' } } } } },
    faqs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
    relatedProjects: { type: 'array', items: { type: 'string' } },
    claims: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'evidenceIds'], properties: { text: { type: 'string' }, evidenceIds: { type: 'array', items: { type: 'string' } } } } }
  }
};

const FACTCHECK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['unsupported', 'notes'],
  properties: { unsupported: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }
};

const ARTICLE_SYSTEM = `You write educational articles for the personal website of a real engineer. Readers are small-business owners and technical buyers.
Hard rules, never broken:
- Anything stated about the author, his clients, projects, results, numbers, credentials, services, pricing or availability MUST come from the evidence list, and each such statement must be listed in "claims" with the evidence ids that support it.
- Never invent clients, testimonials, case results, statistics, prices, timelines or guarantees. If something useful is not in the evidence, leave it out.
- General, widely accepted technical or business explanations are allowed and must be accurate and practical.
- Write in first person as the author ("I"), plainly and helpfully. No hype, no superlatives, no keyword stuffing.
- Internal links use markdown [label](/path) and may only point to paths in validInternalPaths. Link to the service page once where it genuinely helps.`;

export function pickArticleOpportunity(keywords, { attempted }) {
  const observed = (k) => Math.max(k.measured?.gsc?.impressions90d || 0, k.measured?.bing?.impressions || 0, Math.floor((k.measured?.bingMarket?.impressions || 0) / 10));
  return keywords
    .filter((k) => (k.status === 'expansion-opportunity' || String(k.intent).startsWith('informational')) && k.status !== 'requires-evidence' && k.status !== 'not-relevant')
    .filter((k) => k.targetService && SERVICE_BY_SLUG[k.targetService])
    .filter((k) => observed(k) >= 10)
    .filter((k) => !attempted.has(k.keyword))
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0) || observed(b) - observed(a))[0] || null;
}

export async function generateArticle({ site, keyword, validPaths, publish }) {
  const service = SERVICE_BY_SLUG[keyword.targetService];
  const facts = evidenceFacts(site);
  const articles = publishedArticles();
  const draft = await claude.generateJson({
    purpose: 'article-draft',
    schema: ARTICLE_SCHEMA,
    system: ARTICLE_SYSTEM,
    user: JSON.stringify({
      task: `Write a genuinely useful article (900-1500 words across 4-7 sections, plus 2-4 FAQs) answering the search "${keyword.keyword}". It should help the reader whether or not they hire the author, and point them to the relevant service when appropriate.`,
      searchIntent: keyword.intent,
      targetService: { slug: service.slug, name: service.name, url: `/services/${service.slug}`, primaryKeyword: service.primaryKeyword },
      avoidOverlapWith: [...SERVICES.map((s) => ({ url: `/services/${s.slug}`, primaryKeyword: s.primaryKeyword, title: s.title })), ...articles.map((a) => ({ url: `/insights/${a.slug}`, primaryKeyword: a.data.primaryKeyword, title: a.data.title }))],
      constraints: { titleChars: '35-60', metaDescriptionChars: '120-155', slug: 'lowercase-words-with-hyphens, max 6 words', primaryKeyword: 'must differ from every primaryKeyword in avoidOverlapWith' },
      validInternalPaths: [...validPaths],
      projectIds: (site.projects || []).map((p) => ({ id: p.id, title: p.title })),
      evidence: facts
    })
  });
  draft.slug = String(draft.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

  const factCheck = await claude.generateJson({
    purpose: 'article-factcheck',
    schema: FACTCHECK_SCHEMA,
    effort: 'high',
    maxTokens: 8000,
    system: 'You are a strict fact-checker. You compare an article against an evidence list about its author. You flag every specific statement about the author, his clients, projects, results, figures, credentials, services, pricing or availability that the evidence does not directly support. General, widely accepted technical explanations are not flagged. Quote each flagged statement exactly.',
    user: JSON.stringify({ article: articleText(draft), evidence: facts })
  });

  const gate = checkArticle(draft, { site, evidenceIds: new Set(facts.map((f) => f.id)), articles, validPaths, factCheck });
  const pageId = `article:${draft.slug}`;
  const slugTaken = Boolean(getPage(pageId));
  if (slugTaken) gate.failures.push({ check: 'duplication', detail: `slug ${draft.slug} already exists` });
  const passed = gate.failures.length === 0;
  const status = passed && publish ? 'published' : 'draft';
  const reason = passed
    ? `New article for observed search demand "${keyword.keyword}" (${keyword.targetService}); passed all quality-gate checks${publish ? '' : '; autopublish is off, saved as draft'}`
    : `Failed quality gate: ${gate.failures.map((f) => `${f.check}: ${f.detail}`).join(' | ')}`;
  const finalId = slugTaken ? `${pageId}-draft-${Date.now()}` : pageId;
  savePageVersion(finalId, { kind: 'article', status, data: { ...draft, gate, factCheck, sourceKeyword: keyword.keyword }, by: 'content-agent', reason, changeType: passed ? 'article-new' : 'article-draft' });
  appendJsonl('history/research-opportunities.jsonl', { at: new Date().toISOString(), keyword: keyword.keyword, service: keyword.targetService, outcome: status, pageId: finalId, failures: gate.failures });
  return { pageId: finalId, status, gate };
}

export async function run({ getContent, validPaths, performance, keywords }) {
  const cfg = config();
  const site = loadSite(getContent);
  const result = { at: new Date().toISOString(), experiments: [], article: null };
  if (!claude.isConfigured()) {
    result.skipped = 'ANTHROPIC_API_KEY not set: content generation is off. Deterministic jobs (sitemap, IndexNow, audits, analysis) still run.';
    return result;
  }
  result.experiments = await runTitleExperiments({ site, performance });

  const month = new Date().toISOString().slice(0, 7);
  const publishedThisMonth = listPages({ kind: 'article' }).filter((p) => (p.publishedAt || '').startsWith(month)).length;
  if (publishedThisMonth >= cfg.maxArticlesPerMonth) {
    result.article = { status: 'skipped', reason: `monthly cap reached (${publishedThisMonth}/${cfg.maxArticlesPerMonth})` };
    return result;
  }
  const attempted = new Set(readJsonl('history/research-opportunities.jsonl').filter((r) => Date.now() - Date.parse(r.at) < 90 * 86400000).map((r) => r.keyword));
  const opportunity = pickArticleOpportunity(keywords?.keywords || [], { attempted });
  if (!opportunity) {
    result.article = { status: 'skipped', reason: 'no informational opportunity with observed search demand (>=10 impressions) that maps to a verified service and has not been attempted in the last 90 days' };
    return result;
  }
  try {
    result.article = await generateArticle({ site, keyword: opportunity, validPaths, publish: cfg.autopublish });
  } catch (err) {
    result.article = { status: 'error', keyword: opportunity.keyword, error: err.message };
    recordChange({ type: 'article-error', by: 'content-agent', reason: err.message, meta: { keyword: opportunity.keyword } });
  }
  return result;
}
