// Competitor content-gap analysis using only what competitors publish for
// crawlers: their robots.txt-permitted sitemap. No search-result scraping, no
// page-content scraping, robots.txt respected. Competitors are chosen by the
// owner (SEO_COMPETITOR_URLS, comma-separated homepages); none are guessed.
import { secret } from '../config.js';
import { writeJson } from '../store.js';
import { bestServiceFor } from './performanceAnalyzer.js';

const UA = 'bwi-seo-engine';

export function competitorList() {
  return secret('SEO_COMPETITOR_URLS').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
}

export function isAllowed(robots, path) {
  // Minimal robots.txt evaluation: groups for our UA or "*", longest match wins.
  const lines = String(robots || '').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  let applies = false; const rules = [];
  for (const line of lines) {
    const [k, ...rest] = line.split(':'); const v = rest.join(':').trim(); const key = k.trim().toLowerCase();
    if (key === 'user-agent') applies = v === '*' || v.toLowerCase() === UA;
    else if (applies && (key === 'allow' || key === 'disallow') && v) rules.push({ allow: key === 'allow', path: v });
  }
  const match = rules.filter((r) => path.startsWith(r.path)).sort((a, b) => b.path.length - a.path.length)[0];
  return !match || match.allow;
}

function topicFromUrl(u) {
  try {
    const seg = new URL(u).pathname.split('/').filter(Boolean).pop() || '';
    return seg.replace(/\.[a-z]+$/, '').replace(/[-_]+/g, ' ').trim();
  } catch { return ''; }
}

export async function run({ fetchImpl = fetch, ourKeywords = [] } = {}) {
  const sites = competitorList();
  if (!sites.length) {
    const r = { at: new Date().toISOString(), status: 'skipped', reason: 'SEO_COMPETITOR_URLS not set; competitors are never guessed.' };
    writeJson('reports/competitors-latest.json', r);
    return r;
  }
  const ours = new Set(ourKeywords.map((k) => k.toLowerCase()));
  const result = { at: new Date().toISOString(), status: 'ok', competitors: [], gaps: [] };
  for (const home of sites) {
    const entry = { site: home, topics: 0 };
    try {
      const origin = new URL(home).origin;
      const robots = await (await fetchImpl(`${origin}/robots.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) })).text().catch(() => '');
      const sitemapUrl = (robots.match(/^sitemap:\s*(\S+)/im) || [])[1] || `${origin}/sitemap.xml`;
      if (!isAllowed(robots, new URL(sitemapUrl).pathname)) { entry.skipped = 'sitemap disallowed by robots.txt'; result.competitors.push(entry); continue; }
      const xml = await (await fetchImpl(sitemapUrl, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) })).text();
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).slice(0, 500);
      entry.topics = locs.length;
      for (const loc of locs) {
        const topic = topicFromUrl(loc);
        if (!topic || topic.length < 6) continue;
        const svc = bestServiceFor(topic);
        if (!svc || ours.has(topic)) continue;
        result.gaps.push({ competitor: origin, topic, mapsToService: svc.slug, url: loc });
      }
    } catch (err) {
      entry.error = String(err.message).slice(0, 200);
    }
    result.competitors.push(entry);
  }
  writeJson('reports/competitors-latest.json', result);
  return result;
}
