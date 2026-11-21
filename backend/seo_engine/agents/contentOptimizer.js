// Autonomous content agent: deterministic only (owner decision 2026-11-21: no
// LLM, no API cost). Nothing here writes new prose.
//  1. Snippet experiments: for pages with high impressions but CTR well below
//     what their position predicts, build ONE new title OR description (one
//     variable at a time, alternating) from the page's own verified copy and
//     keywords and the real search query that brings people to it, record a baseline, evaluate after a fixed window with
//     a significance test, and roll back automatically if CTR got worse.
//  2. Research briefs: when real search data (GSC/Bing) shows informational
//     demand that maps to a verified service, save a research brief (the query,
//     demand, existing coverage, relevant site evidence, related projects and a
//     suggested outline) for the owner. Briefs are never published.
import { SERVICE_BY_SLUG } from '../catalog.js';
import { readJson, writeJson, appendJsonl, readJsonl, listFiles, exists } from '../store.js';
import { loadSite, evidenceFacts } from '../evidence.js';
import { getPage, savePageVersion, setPageStatus, currentData } from '../pages.js';
import { addExperiment, listExperiments, updateExperiment, changeTypeWeight } from '../learning.js';
import { homeMeta } from '../render/home.js';
import { servicesHubMeta, serviceMeta, projectMeta, findProjectBySlug, publishedArticles } from '../render/pages.js';
import { pageMetrics } from './performanceAnalyzer.js';
import { checkMeta, jaccard, existingTargets } from './qualityGate.js';
import { descriptionCandidates, clip } from './autoFixer.js';

const EXPERIMENT_WINDOW_DAYS = 28;
const RECRAWL_GRACE_DAYS = 4;
const MAX_EXPERIMENT_DAYS = 56;
const MIN_IMPRESSIONS = 200;
const MAX_BRIEFS_PER_RUN = 3;

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


// ---------------- deterministic title proposals ----------------
const UPPER = new Set(['ai', 'az', 'seo', 'pdf', 'llm', 'llms', 'api', 'apis', 'hipaa', 'aws', 'csv', 'ner', 'mlops', 'u.s.', 'us']);
export function titleCase(s) {
  return String(s).split(/\s+/).filter(Boolean).map((w) => (UPPER.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

function topQueriesFor(pageUrl, days = 28) {
  const totals = {};
  for (const f of listFiles('gsc/daily').filter((x) => x.endsWith('.json')).slice(-days)) {
    for (const r of readJson(`gsc/daily/${f}`, {}).pageQuery || []) {
      if (r.page !== pageUrl) continue;
      const t = (totals[r.query] ||= { query: r.query, impressions: 0 });
      t.impressions += r.impressions;
    }
  }
  return Object.values(totals).sort((a, b) => b.impressions - a.impressions);
}

// Builds a title only from (a) the page's own verified keywords and (b) a real
// query that is clearly about that page. No generated wording, no claims.
export function proposeTitle({ target, queries, site, triedTitles = new Set() }) {
  const name = site.profile?.name || 'Idris Paul Kwaya';
  const pool = target.service
    ? [target.service.primaryKeyword, ...target.service.secondaryKeywords]
    : target.pageId === 'page:home' ? [`${site.profile?.title || 'AI Systems Engineer'} Phoenix`, 'AI developer Phoenix', 'software developer Phoenix'] : [];
  if (!pool.length) return null;
  const candidates = [];
  for (const q of queries) {
    const match = Math.max(...pool.map((k) => jaccard(q.query, k)));
    if (match >= 0.5) candidates.push(q.query);
  }
  candidates.push(...pool);
  for (const phrase of candidates) {
    for (const title of [`${titleCase(phrase)} | ${name}`, titleCase(phrase)]) {
      if (title.length < 20 || title.length > 60) continue;
      if (title === target.meta.title || triedTitles.has(title)) continue;
      return { title, basis: queries.some((q) => q.query === phrase) ? `search query "${phrase}"` : `page keyword "${phrase}"` };
    }
  }
  return null;
}

// Description proposals: the page's own verified copy, optionally led by the
// real query that brings searchers to the page (only if it matches the page).
export function proposeDescription({ target, path, queries, site, tried = new Set() }) {
  const pool = target.service ? [target.service.primaryKeyword, ...target.service.secondaryKeywords] : [];
  const match = queries.find((q) => pool.some((k) => jaccard(q.query, k) >= 0.5));
  const base = descriptionCandidates(path, site);
  const candidates = [];
  if (match) for (const b of base) candidates.push(clip(`${titleCase(match.query)}: ${b.charAt(0).toLowerCase()}${b.slice(1)}`, 155));
  candidates.push(...base);
  for (const d of candidates) {
    if (d.length < 70 || d.length > 160 || d === target.meta.metaDescription || tried.has(d)) continue;
    return { metaDescription: d, basis: match ? `search query "${match.query}" + page copy` : 'page copy' };
  }
  return null;
}

// One variable per experiment, alternating title -> description per page, so
// every result can be attributed to a single change.
export async function runSnippetExperiments({ site, performance, maxNew = 1 }) {
  const out = [];
  const all = listExperiments();
  const running = new Set(all.filter((e) => e.status === 'running').map((e) => e.pageId));
  const recent = new Set(all.filter((e) => e.endedAt && Date.now() - Date.parse(e.endedAt) < 30 * 86400000).map((e) => e.pageId));
  for (const finding of performance?.findings?.lowCtr || []) {
    if (out.filter((o) => o.status === 'started').length >= maxNew) break;
    const target = pageForPath(finding.path, site);
    if (!target || target.article || running.has(target.pageId) || recent.has(target.pageId)) continue;
    const history = all.filter((e) => e.pageId === target.pageId).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
    const last = history.at(-1);
    const order = last?.type === 'meta-title' ? ['meta-description', 'meta-title'] : ['meta-title', 'meta-description'];
    const queries = topQueriesFor(finding.page);
    let chosen = null;
    for (const type of order) {
      if (changeTypeWeight(type) < 0.5) continue; // learned: this kind of change has not helped here
      const tried = new Set(history.filter((e) => e.type === type).map((e) => e.after));
      const proposal = type === 'meta-title'
        ? proposeTitle({ target, queries, site, triedTitles: tried })
        : proposeDescription({ target, path: finding.path, queries, site, tried });
      if (proposal) { chosen = { type, proposal }; break; }
    }
    if (!chosen) { out.push({ path: finding.path, status: 'no-candidate', reason: 'no verified keyword, query or page copy produced a new valid title or description (or both change types are paused by learning)' }); continue; }
    const field = chosen.type === 'meta-title' ? 'title' : 'metaDescription';
    const value = chosen.proposal[field];
    const gate = checkMeta({ [field]: value }, { site });
    if (!gate.passed) {
      appendJsonl('history/rejected-changes.jsonl', { at: new Date().toISOString(), pageId: target.pageId, type: chosen.type, proposal: chosen.proposal, gate });
      out.push({ path: finding.path, status: 'rejected-by-gate', gate });
      continue;
    }
    const baselineTo = latestDataDay();
    const baseline = pageMetrics(finding.path, addDays(baselineTo, -(EXPERIMENT_WINDOW_DAYS - 1)), baselineTo);
    const existing = getPage(target.pageId);
    const previousData = existing && existing.status === 'published' ? currentData(existing) : null;
    const before = field === 'title' ? target.meta.title : target.meta.metaDescription;
    const exp = addExperiment({ pageId: target.pageId, path: finding.path, type: chosen.type, variable: field, before, after: value, rationale: `Built from ${chosen.proposal.basis}`, baseline, previousData });
    savePageVersion(target.pageId, {
      kind: 'override', status: 'published', data: { ...(previousData || {}), [field]: value }, by: 'content-agent',
      reason: `${field === 'title' ? 'Title' : 'Description'} experiment ${exp.id}: low CTR (${(finding.ctr * 100).toFixed(1)}% at position ${finding.position.toFixed(1)}); built from ${chosen.proposal.basis}`,
      changeType: chosen.type, experimentId: exp.id
    });
    out.push({ path: finding.path, status: 'started', experimentId: exp.id, type: chosen.type, [field]: value });
  }
  return out;
}

// Backwards-compatible name used by earlier callers/tests.
export const runTitleExperiments = runSnippetExperiments;

// ---------------- research briefs ----------------
export function pickBriefOpportunities(keywords, { attempted, limit = MAX_BRIEFS_PER_RUN }) {
  const observed = (k) => Math.max(k.measured?.gsc?.impressions90d || 0, k.measured?.bing?.impressions || 0, Math.floor((k.measured?.bingMarket?.impressions || 0) / 10));
  return keywords
    .filter((k) => (k.status === 'expansion-opportunity' || String(k.intent).startsWith('informational')) && k.status !== 'requires-evidence' && k.status !== 'not-relevant')
    .filter((k) => k.targetService && SERVICE_BY_SLUG[k.targetService])
    .filter((k) => observed(k) >= 10)
    .filter((k) => !attempted.has(k.keyword))
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0) || observed(b) - observed(a))
    .slice(0, limit);
}

function outlineFor(keyword) {
  const q = String(keyword.keyword);
  const intent = String(keyword.intent || '');
  if (intent.includes('price')) return ['What affects the cost', 'Scope options and what each includes', 'How to get an accurate quote', 'Related service and how to start'];
  if (intent.includes('comparison')) return ['What each option is', 'Where each one fits best', 'Questions to decide between them', 'Related service and how to start'];
  if (/^how\b/.test(q)) return ['The short answer', 'Step-by-step approach', 'Common mistakes to avoid', 'When to get help (related service)'];
  return ['The short answer', 'How it works in practice', 'When it matters for a business', 'Related service and how to start'];
}

export function buildBrief(site, keyword) {
  const service = SERVICE_BY_SLUG[keyword.targetService];
  const facts = evidenceFacts(site);
  const projectIds = service.proof?.projects || [];
  const relevant = facts.filter((f) =>
    f.id === `service.${service.slug}` ||
    projectIds.some((id) => f.id === `project.${id}`) ||
    (service.proof?.experienceMatch || []).some((m) => f.text.includes(m)) ||
    (service.proof?.aiSystems && f.id.startsWith('ai.')) ||
    f.id === 'owner.area');
  const articles = publishedArticles();
  const coverage = existingTargets({ articles })
    .map((t) => ({ page: t.id, similarity: Math.max(...t.keywords.map((k) => jaccard(keyword.keyword, k))) }))
    .filter((c) => c.similarity >= 0.3)
    .sort((a, b) => b.similarity - a.similarity);
  return {
    keyword: keyword.keyword,
    intent: keyword.intent,
    targetService: service.slug,
    targetUrl: `/services/${service.slug}`,
    createdAt: new Date().toISOString(),
    demand: keyword.measured || null,
    opportunityScore: keyword.opportunityScore ?? null,
    existingCoverage: coverage,
    recommendation: coverage.some((c) => c.similarity >= 0.6)
      ? `An existing page already targets this closely (${coverage[0].page}). Consider adding an FAQ there instead of a new page.`
      : 'No existing page targets this query closely. A new article could be justified if you can write it from your own experience.',
    suggestedTitle: titleCase(keyword.keyword),
    suggestedOutline: outlineFor(keyword),
    evidenceToUse: relevant.map((f) => ({ id: f.id, text: f.text })),
    relatedProjects: projectIds.filter((id) => (site.projects || []).some((p) => p.id === id)),
    rules: ['Only state facts listed in evidenceToUse or that you can personally verify', 'No prices, guarantees or results that are not on the site', 'Link once to the service page', 'Publish only if it is genuinely useful to the searcher']
  };
}

export function briefSlug(keyword) {
  return String(keyword).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function listBriefs() {
  return listFiles('briefs').filter((f) => f.endsWith('.json')).map((f) => readJson(`briefs/${f}`, null)).filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function createBriefs({ site, keywords }) {
  const attempted = new Set(readJsonl('history/research-opportunities.jsonl').filter((r) => Date.now() - Date.parse(r.at) < 90 * 86400000).map((r) => r.keyword));
  const created = [];
  for (const k of pickBriefOpportunities(keywords, { attempted })) {
    const slug = briefSlug(k.keyword);
    if (!slug || exists(`briefs/${slug}.json`)) continue;
    const brief = buildBrief(site, k);
    writeJson(`briefs/${slug}.json`, { id: slug, ...brief });
    appendJsonl('history/research-opportunities.jsonl', { at: brief.createdAt, keyword: k.keyword, service: k.targetService, outcome: 'brief', briefId: slug });
    created.push(slug);
  }
  return created;
}

export async function run({ getContent, performance, keywords }) {
  const site = loadSite(getContent);
  const result = { at: new Date().toISOString(), mode: 'deterministic (no LLM)' };
  result.experiments = await runSnippetExperiments({ site, performance });
  const briefs = createBriefs({ site, keywords: keywords?.keywords || [] });
  result.briefs = briefs.length
    ? { status: 'created', ids: briefs }
    : { status: 'none', reason: 'no informational query with observed demand (>=10 impressions) that maps to a verified service and has not been briefed in the last 90 days' };
  return result;
}
