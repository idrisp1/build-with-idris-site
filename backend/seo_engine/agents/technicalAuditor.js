// Technical SEO self-audit. Crawls the site's own public URLs over HTTP (the
// real running server, so middleware, status codes and redirects are what
// crawlers actually see) and checks the requirements from the Phase 1 audit.
import { config } from '../config.js';
import { writeJson, appendJsonl } from '../store.js';
import { getKey } from '../integrations/indexnow.js';
import { validateJsonLd } from './schemaValidator.js';

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

// Decode HTML entities once, the way a browser/search engine reads the text.
export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// True when visible text still contains an HTML entity after decoding, i.e. it
// was escaped twice and users would literally see "&amp;".
export function hasLiteralEntity(text) {
  return /&(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i.test(String(text || ''));
}

export function parseHtml(html) {
  const title = decodeEntities((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '');
  const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (n) => { const t = metaTags.find((x) => attr(x, 'name') === n || attr(x, 'property') === n); return t ? attr(t, 'content') : null; };
  const canonicalTag = (html.match(/<link\b[^>]*rel="canonical"[^>]*>/i) || [])[0];
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, '').trim()));
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  // Links/images inside <script> are client templates, not crawlable markup.
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const links = [...markup.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map((m) => m[1]);
  const imgs = [...markup.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const body = (html.split(/<body[^>]*>/i)[1] || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const visible = body.replace(/<div[^>]*class="modal-overlay"[\s\S]*$/i, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return {
    title, description: meta('description') === null ? null : decodeEntities(meta('description')), robots: meta('robots'), canonical: canonicalTag ? attr(canonicalTag, 'href') : null,
    h1s, jsonLd, links, imgs, words: visible ? visible.split(' ').length : 0
  };
}

function normalizeLink(l, origin) {
  if (l.startsWith('/') && !l.startsWith('//')) return l.split('#')[0].split('?')[0] || '/';
  if (origin && l.startsWith(origin)) return l.slice(origin.length).split('#')[0].split('?')[0] || '/';
  return null;
}

// inbound[path] = set of OTHER audited pages that link to it.
export function linkGraph(pages, origin) {
  const inbound = {};
  for (const path of Object.keys(pages)) inbound[path] = new Set();
  for (const [from, p] of Object.entries(pages)) {
    for (const l of p.links || []) {
      const to = normalizeLink(l, origin);
      if (to && to !== from && inbound[to]) inbound[to].add(from);
    }
  }
  return inbound;
}

// Orphans (no other page links to them) and case studies that no service page
// links to (they prove a service, so the service page should point at them).
export function internalLinkIssues(inbound, paths) {
  const issues = [];
  for (const path of paths) {
    if (path === '/') continue;
    const from = [...(inbound[path] || [])];
    if (!from.length) {
      issues.push({ severity: 'warning', path, check: 'orphan-page', detail: 'no other page on the site links to this page' });
    } else if (path.startsWith('/projects/') && !from.some((f) => f.startsWith('/services/'))) {
      issues.push({ severity: 'warning', path, check: 'missing-contextual-link', detail: `linked only from ${from.join(', ')}; no service page links to this case study (add the project to that service's proof list in backend/seo_engine/catalog.js)` });
    }
  }
  return issues;
}

export async function audit({ baseUrl, paths, fetchImpl = fetch, checkExternal = false, externalLinks = [], vocab = null }) {
  const { origin } = config();
  const issues = [];
  const add = (severity, path, check, detail) => issues.push({ severity, path, check, detail });
  const pages = {};
  const get = (p, opts = {}) => fetchImpl(`${baseUrl}${p}`, { redirect: 'manual', headers: { 'user-agent': 'bwi-technical-auditor' }, signal: AbortSignal.timeout(15000), ...opts });

  for (const path of paths) {
    let res;
    const started = Date.now();
    try { res = await get(path); } catch (err) { add('error', path, 'fetch', err.message); continue; }
    if (res.status !== 200) { add('error', path, 'status', `HTTP ${res.status}`); continue; }
    const html = await res.text();
    const p = parseHtml(html);
    p.responseMs = Date.now() - started;
    p.bytes = Buffer.byteLength(html);
    pages[path] = p;
    if (p.responseMs > 1500) add('warning', path, 'slow-response', `${p.responseMs} ms server response`);
    if (!p.title) add('error', path, 'title', 'missing'); else if (p.title.length > 60) add('warning', path, 'title', `${p.title.length} chars (search results truncate around 60)`);
    if (hasLiteralEntity(p.title)) add('error', path, 'title', `shows a literal HTML entity to users: "${p.title}"`);
    if (hasLiteralEntity(p.description)) add('error', path, 'meta-description', 'shows a literal HTML entity to users');
    if (!p.description) add('error', path, 'meta-description', 'missing'); else if (p.description.length < 50 || p.description.length > 170) add('warning', path, 'meta-description', `${p.description.length} chars`);
    if (p.h1s.length !== 1) add('warning', path, 'h1', `${p.h1s.length} h1 elements`);
    if (p.canonical !== `${origin}${path === '/' ? '/' : path}`) add('error', path, 'canonical', `canonical is ${p.canonical}`);
    if (/noindex/i.test(p.robots || '')) add('error', path, 'robots-meta', 'sitemap URL is noindex');
    if (!p.jsonLd.length) add('warning', path, 'structured-data', 'no JSON-LD');
    for (const block of p.jsonLd) {
      try { JSON.parse(block); } catch { add('error', path, 'structured-data', 'invalid JSON-LD'); continue; }
      if (vocab) for (const i of validateJsonLd(vocab, block, path)) add(i.severity, path, 'structured-data', i.detail);
    }
    for (const img of p.imgs) if (!/\balt="[^"]+"/.test(img)) add('warning', path, 'img-alt', img.slice(0, 80));
    if (p.words < 150) add('warning', path, 'thin-content', `${p.words} words in initial HTML`);
  }

  // Duplicate titles / descriptions across pages
  const seen = {};
  for (const [path, p] of Object.entries(pages)) {
    for (const k of ['title', 'description']) {
      const v = p[k];
      if (!v) continue;
      const key = `${k}:${v}`;
      if (seen[key]) add('warning', path, `duplicate-${k}`, `same as ${seen[key]}`); else seen[key] = path;
    }
  }

  // Internal links
  const internal = new Set();
  for (const p of Object.values(pages)) for (const l of p.links) {
    if (l.startsWith('/') && !l.startsWith('//')) internal.add(l.split('#')[0] || '/');
    else if (l.startsWith(origin)) internal.add(l.slice(origin.length).split('#')[0] || '/');
  }
  for (const l of internal) {
    if (pages[l]) continue;
    try {
      const r = await get(l);
      if (r.status >= 400) add('error', l, 'broken-internal-link', `HTTP ${r.status}`);
    } catch (err) { add('error', l, 'broken-internal-link', err.message); }
  }

  // Missing internal links: who links to each audited page?
  const inbound = linkGraph(pages, origin);
  for (const issue of internalLinkIssues(inbound, Object.keys(pages))) add(issue.severity, issue.path, issue.check, issue.detail);

  // Site-level checks
  const site = async (path, check, expect) => {
    try {
      const r = await get(path);
      const text = r.status === 200 ? await r.text() : '';
      const ok = expect(r, text);
      if (!ok) add('error', path, check, `HTTP ${r.status}`);
      return ok;
    } catch (err) { add('error', path, check, err.message); return false; }
  };
  await site('/robots.txt', 'robots.txt', (r, t) => r.status === 200 && t.includes('Sitemap:') && /User-agent: OAI-SearchBot\nAllow: \//.test(t));
  await site('/sitemap.xml', 'sitemap', (r, t) => r.status === 200 && t.includes('<urlset') && paths.every((p) => t.includes(`<loc>${origin}${p}</loc>`)));
  await site(`/${getKey()}.txt`, 'indexnow-key-file', (r, t) => r.status === 200 && t.trim() === getKey());
  await site('/index.html', 'duplicate-url-redirect', (r) => r.status === 301);
  await site('/this-page-should-not-exist-404-check', 'soft-404', (r) => r.status === 404);

  // External links from project data (weekly)
  if (checkExternal) {
    for (const url of externalLinks) {
      try {
        const r = await fetchImpl(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; bwi-link-checker)' }, signal: AbortSignal.timeout(15000) });
        if (r.status >= 400) add('warning', url, 'broken-external-link', `HTTP ${r.status}`);
      } catch (err) { add('warning', url, 'broken-external-link', err.cause?.code ? `${err.cause.code}: ${err.cause.message || ''}`.trim() : err.message); }
    }
  }

  const report = {
    at: new Date().toISOString(), pagesChecked: Object.keys(pages).length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    issues,
    schemaValidated: Boolean(vocab),
    pages: Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, { title: v.title, description: v.description, words: v.words, h1: v.h1s[0] || null, responseMs: v.responseMs, bytes: v.bytes }]))
  };
  writeJson('reports/technical-latest.json', report);
  appendJsonl('history/technical-audits.jsonl', { at: report.at, pagesChecked: report.pagesChecked, errors: report.errors, warnings: report.warnings });
  return report;
}
