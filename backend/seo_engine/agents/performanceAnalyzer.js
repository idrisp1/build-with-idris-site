// Performance analysis over the persisted daily Search Console history.
// Compares the most recent 28 finalized days against the 28 before, and flags
// opportunities. Thresholds require minimum data so random fluctuation on a
// low-traffic site is not reported as a trend.
import { SERVICES } from '../catalog.js';
import { readJson, writeJson, listFiles, appendJsonl } from '../store.js';
import { config } from '../config.js';
import { jaccard } from './qualityGate.js';

// Rough organic CTR by position (industry-style curve). Used only as a
// heuristic to spot snippets that under-perform for their position.
export function expectedCtr(position) {
  if (position <= 1.5) return 0.28;
  if (position <= 2.5) return 0.15;
  if (position <= 3.5) return 0.10;
  if (position <= 5.5) return 0.06;
  if (position <= 10.5) return 0.03;
  if (position <= 20.5) return 0.01;
  return 0.003;
}

export function loadDays(n, { offset = 0 } = {}) {
  const files = listFiles('gsc/daily').filter((f) => f.endsWith('.json'));
  const slice = files.slice(Math.max(0, files.length - n - offset), files.length - offset);
  return slice.map((f) => readJson(`gsc/daily/${f}`, null)).filter(Boolean);
}

export function aggregate(days, key) {
  const out = {};
  for (const d of days) {
    for (const r of (key === 'page' ? d.pages : d.pageQuery) || []) {
      const k = key === 'page' ? r.page : key === 'query' ? r.query : `${r.query}\u0000${r.page}`;
      const a = (out[k] ||= { clicks: 0, impressions: 0, posWeighted: 0 });
      a.clicks += r.clicks;
      a.impressions += r.impressions;
      a.posWeighted += r.position * r.impressions;
    }
  }
  for (const a of Object.values(out)) {
    a.ctr = a.impressions ? a.clicks / a.impressions : 0;
    a.position = a.impressions ? a.posWeighted / a.impressions : null;
    delete a.posWeighted;
  }
  return out;
}

function pathOf(url) {
  try { return new URL(url).pathname.replace(/\/$/, '') || '/'; } catch { return url; }
}

export function bestServiceFor(query) {
  let best = null;
  for (const s of SERVICES) {
    const score = Math.max(...[s.primaryKeyword, ...s.secondaryKeywords, s.name].map((k) => jaccard(query, k)));
    if (!best || score > best.score) best = { slug: s.slug, score };
  }
  return best && best.score >= 0.25 ? best : null;
}

export function analyze() {
  const recent = loadDays(28);
  const previous = loadDays(28, { offset: 28 });
  const report = { at: new Date().toISOString(), window: { recentDays: recent.length, previousDays: previous.length, from: recent[0]?.date || null, to: recent.at(-1)?.date || null }, findings: {} };
  if (!recent.length) {
    report.status = 'no-data';
    report.note = 'No Search Console history stored yet (gsc-sync has not completed a run).';
    writeJson('reports/performance-latest.json', report);
    return report;
  }
  const pagesNow = aggregate(recent, 'page');
  const pagesPrev = aggregate(previous, 'page');
  const queriesNow = aggregate(recent, 'query');
  const pairsNow = aggregate(recent, 'pair');

  const f = report.findings;
  f.totals = Object.values(pagesNow).reduce((t, a) => ({ clicks: t.clicks + a.clicks, impressions: t.impressions + a.impressions }), { clicks: 0, impressions: 0 });

  f.lowCtr = Object.entries(pagesNow)
    .filter(([, a]) => a.impressions >= 100 && a.position && a.ctr < expectedCtr(a.position) * 0.5)
    .map(([page, a]) => ({ page, path: pathOf(page), ...a, expectedCtr: expectedCtr(a.position) }))
    .sort((x, y) => y.impressions - x.impressions);

  f.declining = Object.entries(pagesNow).map(([page, a]) => ({ page, now: a, prev: pagesPrev[page] })).filter(({ now, prev }) => prev && (
    (prev.clicks >= 10 && now.clicks <= prev.clicks * 0.7) || (prev.impressions >= 200 && now.impressions <= prev.impressions * 0.6)
  )).map(({ page, now, prev }) => ({ page, path: pathOf(page), clicksNow: now.clicks, clicksPrev: prev.clicks, impressionsNow: now.impressions, impressionsPrev: prev.impressions, positionNow: now.position, positionPrev: prev.position }));

  f.rising = Object.entries(pagesNow).filter(([page, a]) => pagesPrev[page]?.impressions >= 50 && a.impressions >= pagesPrev[page].impressions * 1.5)
    .map(([page, a]) => ({ page, path: pathOf(page), impressionsNow: a.impressions, impressionsPrev: pagesPrev[page].impressions }));

  f.strikingDistance = Object.entries(queriesNow).filter(([, a]) => a.position >= 8 && a.position <= 20 && a.impressions >= 30)
    .map(([query, a]) => ({ query, ...a, service: bestServiceFor(query)?.slug || null })).sort((x, y) => y.impressions - x.impressions).slice(0, 50);

  // Cannibalization: one query, several of our pages each taking a real share.
  const byQuery = {};
  for (const [k, a] of Object.entries(pairsNow)) {
    const [query, page] = k.split('\u0000');
    (byQuery[query] ||= []).push({ page, ...a });
  }
  f.cannibalization = Object.entries(byQuery).map(([query, rows]) => {
    const total = rows.reduce((n, r) => n + r.impressions, 0);
    const competing = rows.filter((r) => r.impressions / total >= 0.1);
    return { query, total, competing };
  }).filter((x) => x.total >= 30 && x.competing.length >= 2).sort((a, b) => b.total - a.total);

  // Coverage gaps: query clearly about a service, but impressions land on a
  // page that is not that service's page (e.g. the homepage).
  f.coverageGaps = [];
  for (const [query, rows] of Object.entries(byQuery)) {
    const best = bestServiceFor(query);
    if (!best) continue;
    const target = `/services/${best.slug}`;
    const total = rows.reduce((n, r) => n + r.impressions, 0);
    if (total < 20) continue;
    const onTarget = rows.filter((r) => pathOf(r.page) === target).reduce((n, r) => n + r.impressions, 0);
    if (onTarget / total < 0.5) f.coverageGaps.push({ query, impressions: total, expectedPage: target, rankingPages: rows.map((r) => pathOf(r.page)) });
  }

  // Device split for flagged pages (context, so a mobile-only problem is visible).
  const deviceSplit = {};
  for (const d of recent) for (const r of d.devices || []) {
    const k = `${pathOf(r.page)}|${r.device}`;
    const a = (deviceSplit[k] ||= { clicks: 0, impressions: 0 });
    a.clicks += r.clicks; a.impressions += r.impressions;
  }
  f.deviceSplit = deviceSplit;
  const countries = {};
  for (const d of recent) for (const r of d.countries || []) countries[r.country] = (countries[r.country] || 0) + r.impressions;
  f.topCountries = Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Indexing status from URL Inspection (never inferred from submission).
  const inspection = readJson('gsc/inspection.json', {});
  f.notIndexed = Object.entries(inspection).filter(([, r]) => r.verdict && r.verdict !== 'PASS').map(([url, r]) => ({ url, verdict: r.verdict, coverageState: r.coverageState }));

  report.status = 'ok';
  report.site = config().origin;
  writeJson('reports/performance-latest.json', report);
  appendJsonl('history/performance-snapshots.jsonl', { at: report.at, window: report.window, totals: f.totals, pages: Object.fromEntries(Object.entries(pagesNow).map(([p, a]) => [pathOf(p), { c: a.clicks, i: a.impressions, pos: a.position && Number(a.position.toFixed(2)) }])) });
  return report;
}

// Page metrics over an explicit date range (used by experiment evaluation).
export function pageMetrics(path, fromDate, toDate) {
  const files = listFiles('gsc/daily').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, 10)).filter((d) => d >= fromDate && d <= toDate);
  let clicks = 0; let impressions = 0; let posW = 0;
  for (const d of files) {
    const day = readJson(`gsc/daily/${d}.json`, null);
    for (const r of day?.pages || []) {
      if (pathOf(r.page) !== path) continue;
      clicks += r.clicks; impressions += r.impressions; posW += r.position * r.impressions;
    }
  }
  return { days: files.length, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? posW / impressions : null };
}
