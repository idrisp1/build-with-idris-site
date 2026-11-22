// Competitor content-gap analysis using only what competitors publish for
// crawlers: their robots.txt-permitted sitemap. No search-result scraping, no
// page-content scraping, robots.txt respected. Competitors are chosen by the
// owner (SEO_COMPETITOR_URLS, comma-separated homepages); none are guessed.
import { secret } from '../config.js';
import { readJson, writeJson } from '../store.js';
import { bestServiceFor } from './performanceAnalyzer.js';
import { tokens } from './qualityGate.js';

const UA = 'bwi-seo-engine';

// The list saved from the admin panel wins; otherwise the SEO_COMPETITOR_URLS setting is used.
export function competitorList() {
  const saved = readJson('settings/competitors.json', null);
  if (saved && Array.isArray(saved.urls) && saved.urls.length) return saved.urls.slice(0, 10);
  return secret('SEO_COMPETITOR_URLS').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
}

// Validates owner-entered competitor homepages: https, a real domain, never our own site, max 10.
export function cleanCompetitorUrls(input, ownHost) {
  const out = [];
  for (const raw of (Array.isArray(input) ? input : String(input || '').split(/[\n,]+/))) {
    let v = String(raw).trim();
    if (!v) continue;
    if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
    try {
      const u = new URL(v);
      const h = u.hostname.toLowerCase();
      if (!h.includes('.') || h.replace(/^www\./, '') === String(ownHost || '').replace(/^www\./, '')) continue;
      const origin = `https://${h}`;
      if (!out.includes(origin)) out.push(origin);
    } catch { /* not a URL */ }
  }
  return out.slice(0, 10);
}

export function saveCompetitorList(urls, by = 'owner') {
  writeJson('settings/competitors.json', { urls, by, at: new Date().toISOString() });
  return urls;
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

// Readable topic from a URL slug: drops the competitor's brand word, "blog",
// and trailing ID/date tokens (e.g. "... 202611201513").
export function topicFromUrl(u, brand = '') {
  try {
    const seg = new URL(u).pathname.split('/').filter(Boolean).pop() || '';
    const words = seg.replace(/\.[a-z]+$/, '').replace(/[-_]+/g, ' ').trim().toLowerCase().split(/\s+/).filter((w) => w && w !== brand && w !== 'blog');
    while (words.length && words.at(-1).length >= 3 && /\d/.test(words.at(-1))) words.pop();
    return words.join(' ');
  } catch { return ''; }
}

const brandOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, '').split('.')[0]; } catch { return ''; } };

// A topic counts as already covered when it closely matches one of our own
// phrases (service keywords, published article titles and keywords): high word
// overlap, or every word of the topic appears in one of our phrases.
const FILLER = new Set('guide guides checklist basics explained tips ideas examples complete ultimate beginner beginners introduction intro overview simple practical small business businesses'.split(' '));
const core = (text) => new Set(tokens(text).filter((w) => !FILLER.has(w)));

export function coveredBy(topic, phrases) {
  const t = core(topic);
  if (!t.size) return null;
  for (const p of phrases) {
    const q = core(p);
    if (!q.size) continue;
    let inter = 0;
    for (const w of t) if (q.has(w)) inter += 1;
    if (inter / (t.size + q.size - inter) >= 0.6 || (t.size >= 2 && inter === t.size)) return p;
  }
  return null;
}

// Competitors often publish the same page for many cities. Pages aimed at
// places outside Arizona are not useful article ideas for a Phoenix business.
const OTHER_PLACES = /\b(seattle|boise|houston|dallas|austin|san antonio|fort worth|el paso|orlando|miami|tampa|jacksonville|atlanta|chicago|nashville|memphis|st louis|kansas city|fresno|sacramento|san diego|los angeles|san francisco|san jose|oakland|portland|salem|eugene|medford|bend|denver|boulder|las vegas|reno|salt lake|albuquerque|minneapolis|detroit|cleveland|columbus|cincinnati|indianapolis|milwaukee|charlotte|raleigh|richmond|baltimore|philadelphia|pittsburgh|boston|new york|brooklyn|new jersey|newark|washington dc|omaha|lincoln|tulsa|oklahoma|louisville|new orleans|birmingham|honolulu|anchorage|jupiter|springfield|toronto|vancouver|london|sydney|dubai)\b/;

export async function run({ fetchImpl = fetch, ourKeywords = [], coveredPhrases = [] } = {}) {
  const sites = competitorList();
  if (!sites.length) {
    const r = { at: new Date().toISOString(), status: 'skipped', reason: 'No competitors listed yet (SEO Engine panel → Competitor gaps). Competitors are never guessed.' };
    writeJson('reports/competitors-latest.json', r);
    return r;
  }
  const ours = new Set(ourKeywords.map((k) => k.toLowerCase()));
  const brands = new Set(sites.map(brandOf));
  const get = async (url) => fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
  const result = { at: new Date().toISOString(), status: 'ok', competitors: [], gaps: [] };
  const gapMap = new Map();
  const covered = new Set();
  const otherPlaces = new Set();
  for (const home of sites) {
    const entry = { site: home, topics: 0 };
    try {
      const origin = new URL(home).origin;
      const brand = brandOf(home);
      const rr = await get(`${origin}/robots.txt`);
      const robots = await rr.text().catch(() => '');
      if ([401, 403, 429].includes(rr.status) || robots.slice(0, 5000).includes('challenge-platform')) {
        entry.skipped = `this site blocks automated access (HTTP ${rr.status}), so it was skipped out of respect for that`;
        result.competitors.push(entry);
        continue;
      }
      const maps = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
      const queue = (maps.length ? maps : [`${origin}/sitemap.xml`]).slice(0, 3);
      const seen = new Set();
      const locs = [];
      // Follow sitemap indexes (preferring blog/article/guide children), max 8 files.
      while (queue.length && seen.size < 8 && locs.length < 3000) {
        const sm = queue.shift();
        if (seen.has(sm)) continue;
        seen.add(sm);
        if (!isAllowed(robots, new URL(sm).pathname)) continue;
        const xml = await (await get(sm)).text();
        const found = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
        if (/<sitemapindex/i.test(xml)) {
          found.sort((a, b) => Number(!/post|article|blog|guide|resource|learn|insight/i.test(a)) - Number(!/post|article|blog|guide|resource|learn|insight/i.test(b)));
          queue.push(...found.slice(0, 6));
        } else locs.push(...found);
      }
      if (!seen.size || (!locs.length && [...seen].every((sm) => !isAllowed(robots, new URL(sm).pathname)))) entry.skipped = 'sitemap disallowed by robots.txt';
      entry.topics = locs.length;
      let rank = 0;
      for (const loc of locs.slice(0, 3000)) {
        const topic = topicFromUrl(loc, brand);
        const words = topic.split(' ');
        if (topic.length < 6 || words.length < 2 || words.some((w) => brands.has(w))) continue; // one-word slugs and brand pages are not article ideas
        if (!isAllowed(robots, new URL(loc).pathname)) continue;
        const svc = bestServiceFor(topic);
        if (!svc || ours.has(topic)) continue;
        if (OTHER_PLACES.test(topic)) { otherPlaces.add(topic); continue; } // aimed at another city or region
        if (!gapMap.has(topic) && coveredBy(topic, coveredPhrases)) { covered.add(topic); continue; } // a page of ours already covers it
        let g = gapMap.get(topic);
        if (!g) { rank += 1; g = { competitor: origin, topic, mapsToService: svc.slug, url: loc, competitors: [], _rank: rank }; gapMap.set(topic, g); }
        if (!g.competitors.includes(origin)) g.competitors.push(origin);
      }
    } catch (err) {
      entry.error = String(err.message).slice(0, 200);
    }
    result.competitors.push(entry);
  }
  // One row per topic; topics covered by more competitors first, competitors
  // interleaved so one large sitemap can't crowd out the rest.
  result.gaps = [...gapMap.values()].sort((a, b) => b.competitors.length - a.competitors.length || a._rank - b._rank || a.topic.localeCompare(b.topic))
    .slice(0, 300).map(({ _rank, ...g }) => g);
  result.alreadyCovered = covered.size; // topics dropped because one of our pages already covers them
  result.otherPlaces = otherPlaces.size; // city pages for places outside Arizona, dropped
  writeJson('reports/competitors-latest.json', result);
  return result;
}
