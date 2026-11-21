// Keyword intelligence: keeps a working keyword dataset (seeded from the
// repo's seo_engine/keyword_research/keyword_data.json) up to date with REAL
// observed demand from Search Console and Bing, discovers new queries and
// questions, and classifies each against the verified service catalog.
// Sources are only official APIs (no SERP scraping).
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../config.js';
import { readJson, writeJson, appendJsonl } from '../store.js';
import { aggregate, loadDays, bestServiceFor } from './performanceAnalyzer.js';
import * as bing from '../integrations/bing.js';

const SEED_FILE = path.join(PROJECT_ROOT, 'seo_engine', 'keyword_research', 'keyword_data.json');

export function normalizeQuery(q) {
  return String(q || '').toLowerCase().replace(/[^a-z0-9\s.]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function classifyIntent(q) {
  if (/\b(cost|price|pricing|how much|rates?|quote)\b/.test(q)) return 'informational/price';
  if (/\b(vs|versus|compare|comparison|alternative)\b/.test(q)) return 'informational/comparison';
  if (/^(how|what|why|when|where|which|who|is|can|does|do|should)\b|\?$/.test(q)) return 'informational/question';
  if (/\bnear me\b|\bphoenix\b|\baz\b|\barizona\b/.test(q)) return 'local-commercial';
  if (/\b(hire|services?|agency|company|consultant|freelance|developer|designer|expert)\b/.test(q)) return 'commercial';
  return 'unclassified';
}

// Log-scaled observed impressions over 90 days -> demand tier 1-5.
export function demandFromImpressions(imp) {
  if (!imp || imp <= 0) return 1;
  return Math.max(1, Math.min(5, 1 + Math.floor(Math.log10(imp + 1))));
}

function loadDataset() {
  const working = readJson('keywords.json', null);
  if (working) return working;
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const ds = { seededFrom: 'seo_engine/keyword_research/keyword_data.json', scoring: seed.scoring, keywords: seed.keywords.map((k) => ({ ...k, source: 'seed' })) };
  writeJson('keywords.json', ds);
  return ds;
}

function score(k) {
  return Math.round((k.demandTier * k.businessRelevance * k.conversionPotential * k.rankingFeasibility) / 625 * 100);
}

export async function run({ useBing = bing.isConfigured(), bingRelatedLimit = 8 } = {}) {
  const ds = loadDataset();
  const byKey = new Map(ds.keywords.map((k) => [normalizeQuery(k.keyword), k]));
  const discovered = [];

  // ---- Search Console: last 90 finalized days ----
  const days = loadDays(90);
  const queries = aggregate(days, 'query');
  for (const [q, a] of Object.entries(queries)) {
    const nq = normalizeQuery(q);
    if (!nq) continue;
    let k = byKey.get(nq);
    if (!k) {
      const svc = bestServiceFor(nq);
      const intent = classifyIntent(nq);
      k = {
        keyword: nq, categories: ['K'], intent, geo: /phoenix|\baz\b|arizona/.test(nq) ? 'Phoenix' : 'US',
        targetUrl: svc ? `/services/${svc.slug}` : null, targetService: svc?.slug || null,
        status: !svc ? 'not-relevant' : intent.startsWith('informational') ? 'expansion-opportunity' : 'existing-page',
        demandTier: 1, demandSource: 'gsc', businessRelevance: svc ? (svc.score >= 0.5 ? 5 : 3) : 1,
        conversionPotential: intent.startsWith('informational') ? 2 : 4, rankingFeasibility: 4,
        source: 'gsc', discoveredAt: new Date().toISOString()
      };
      ds.keywords.push(k);
      byKey.set(nq, k);
      discovered.push(nq);
    }
    k.measured = { ...(k.measured || {}), gsc: { impressions90d: a.impressions, clicks90d: a.clicks, position: a.position && Number(a.position.toFixed(1)), updatedAt: new Date().toISOString() } };
  }

  // ---- Bing: site query stats ----
  if (useBing) {
    try {
      const rows = await bing.getQueryStats();
      const agg = {};
      for (const r of rows || []) {
        const nq = normalizeQuery(r.Query);
        const a = (agg[nq] ||= { impressions: 0, clicks: 0, posW: 0 });
        a.impressions += r.Impressions || 0; a.clicks += r.Clicks || 0; a.posW += (r.AvgImpressionPosition || 0) * (r.Impressions || 0);
      }
      for (const [nq, a] of Object.entries(agg)) {
        let k = byKey.get(nq);
        if (!k) {
          const svc = bestServiceFor(nq);
          const intent = classifyIntent(nq);
          k = { keyword: nq, categories: ['K'], intent, geo: 'US', targetUrl: svc ? `/services/${svc.slug}` : null, targetService: svc?.slug || null, status: svc ? (intent.startsWith('informational') ? 'expansion-opportunity' : 'existing-page') : 'not-relevant', demandTier: 1, demandSource: 'bing', businessRelevance: svc ? 3 : 1, conversionPotential: intent.startsWith('informational') ? 2 : 4, rankingFeasibility: 4, source: 'bing', discoveredAt: new Date().toISOString() };
          ds.keywords.push(k); byKey.set(nq, k); discovered.push(nq);
        }
        k.measured = { ...(k.measured || {}), bing: { impressions: a.impressions, clicks: a.clicks, position: a.impressions ? Number((a.posW / a.impressions).toFixed(1)) : null, updatedAt: new Date().toISOString() } };
      }
    } catch (err) {
      appendJsonl('history/errors.jsonl', { at: new Date().toISOString(), job: 'keyword-intelligence', source: 'bing-query-stats', error: String(err.message).slice(0, 300) });
    }

    // ---- Bing keyword research: related keywords for top seed terms ----
    const seeds = ds.keywords.filter((k) => k.source === 'seed' && ['missing-page', 'existing-page'].includes(k.status)).sort((a, b) => score(b) - score(a)).slice(0, bingRelatedLimit);
    for (const s of seeds) {
      try {
        const related = await bing.getRelatedKeywords(s.keyword);
        for (const r of related || []) {
          const nq = normalizeQuery(r.Query);
          if (!nq || byKey.has(nq)) {
            if (byKey.has(nq)) byKey.get(nq).measured = { ...(byKey.get(nq).measured || {}), bingMarket: { impressions: r.Impressions || 0, updatedAt: new Date().toISOString() } };
            continue;
          }
          const svc = bestServiceFor(nq);
          if (!svc) continue; // only keep candidates that map to a real service
          const intent = classifyIntent(nq);
          const k = { keyword: nq, categories: ['K'], intent, geo: 'US', targetUrl: `/services/${svc.slug}`, targetService: svc.slug, status: intent.startsWith('informational') ? 'expansion-opportunity' : 'existing-page', demandTier: 1, demandSource: 'bing-market', businessRelevance: svc.score >= 0.5 ? 4 : 3, conversionPotential: intent.startsWith('informational') ? 2 : 4, rankingFeasibility: 3, source: 'bing-related', relatedTo: s.keyword, discoveredAt: new Date().toISOString(), measured: { bingMarket: { impressions: r.Impressions || 0, updatedAt: new Date().toISOString() } } };
          ds.keywords.push(k); byKey.set(nq, k); discovered.push(nq);
        }
      } catch (err) {
        appendJsonl('history/errors.jsonl', { at: new Date().toISOString(), job: 'keyword-intelligence', source: 'bing-related', keyword: s.keyword, error: String(err.message).slice(0, 300) });
      }
    }
  }

  // ---- Replace estimated demand with measured demand where available ----
  for (const k of ds.keywords) {
    const observed = Math.max(k.measured?.gsc?.impressions90d || 0, k.measured?.bing?.impressions || 0, (k.measured?.bingMarket?.impressions || 0) / 10);
    if (observed > 0) {
      k.demandTierEstimate ??= k.demandTier;
      k.demandTier = demandFromImpressions(observed);
      k.demandSource = 'measured';
    }
    k.opportunityScore = score(k);
  }
  ds.updatedAt = new Date().toISOString();
  writeJson('keywords.json', ds);

  const questions = ds.keywords.filter((k) => k.intent === 'informational/question' && k.measured);
  const report = { at: ds.updatedAt, total: ds.keywords.length, discovered, emergingQuestions: questions.map((k) => k.keyword).slice(0, 30), gscDays: days.length, bingUsed: useBing };
  writeJson('reports/keywords-latest.json', report);
  return report;
}

export function dataset() {
  return loadDataset();
}
