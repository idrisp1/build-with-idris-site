// sitemap.xml, robots.txt, llms.txt and the URL state tracker that gives the
// sitemap real <lastmod> values and drives IndexNow (only URLs whose rendered
// content actually changed are re-submitted).
import crypto from 'node:crypto';
import { config } from '../config.js';
import { SERVICES } from '../catalog.js';
import { readJson, writeJson } from '../store.js';
import { esc } from './layout.js';
import { projectSlug, projectInfo, publishedArticles } from './pages.js';

// Every public, indexable URL the site intends search engines to know about.
export function publicPaths(site) {
  const paths = ['/', '/services', ...SERVICES.map((s) => `/services/${s.slug}`)];
  for (const p of site.projects || []) {
    if (projectInfo(site, p).indexable) paths.push(`/projects/${projectSlug(p.id)}`);
  }
  const articles = publishedArticles();
  if (articles.length) {
    paths.push('/insights');
    for (const a of articles) paths.push(`/insights/${a.slug}`);
  }
  return paths;
}

function contentHash(html) {
  // Ignore the copyright year so a new year doesn't mark every page "changed".
  const normalized = String(html).replace(/&copy;\s*\d{4}/g, '&copy;');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// renderPath(path) -> html string (or null). Updates data/seo/url-state.json:
// { [path]: { hash, firstSeen, changedAt, removedAt? } } and returns the diff.
export function refreshUrlState(site, renderPath) {
  const state = readJson('url-state.json', {});
  const now = new Date().toISOString();
  const current = new Set(publicPaths(site));
  const changed = [];
  const added = [];
  const removed = [];
  for (const path of current) {
    const html = renderPath(path);
    if (!html) continue;
    const hash = contentHash(html);
    const prev = state[path];
    if (!prev || prev.removedAt) {
      state[path] = { hash, firstSeen: prev?.firstSeen || now, changedAt: now };
      added.push(path);
    } else if (prev.hash !== hash) {
      state[path] = { ...prev, hash, changedAt: now };
      changed.push(path);
    }
  }
  for (const [path, rec] of Object.entries(state)) {
    if (!current.has(path) && !rec.removedAt) {
      state[path] = { ...rec, removedAt: now };
      removed.push(path);
    }
  }
  writeJson('url-state.json', state);
  return { added, changed, removed, state };
}

export function urlState() {
  return readJson('url-state.json', {});
}

export function sitemapXml(site) {
  const { origin } = config();
  const state = urlState();
  const fallback = site.updatedAt || new Date().toISOString();
  const urls = publicPaths(site).map((path) => {
    const lastmod = (state[path]?.changedAt || fallback).slice(0, 10);
    return `  <url>\n    <loc>${esc(origin + path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

// Owner decision (2026-11-21): allow search/citation crawlers, block crawlers
// whose purpose is collecting model-training data. A named group overrides
// the "*" group for that bot, so each blocked bot gets "Disallow: /".
export const TRAINING_CRAWLERS = ['GPTBot', 'Google-Extended', 'CCBot', 'ClaudeBot', 'Applebot-Extended', 'Meta-ExternalAgent', 'Bytespider'];
export const SEARCH_CRAWLERS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot', 'Claude-User', 'Bingbot', 'Googlebot'];

export function robotsTxt() {
  const { origin } = config();
  const lines = ['# Search engines and AI search/citation crawlers: welcome.', 'User-agent: *', 'Allow: /', 'Disallow: /api/', ''];
  for (const bot of SEARCH_CRAWLERS) lines.push(`User-agent: ${bot}`, 'Allow: /', 'Disallow: /api/', '');
  lines.push('# Model-training crawlers: not permitted (owner preference).');
  for (const bot of TRAINING_CRAWLERS) lines.push(`User-agent: ${bot}`, 'Disallow: /', '');
  lines.push(`Sitemap: ${origin}/sitemap.xml`, '');
  return lines.join('\n');
}

function plain(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// llms.txt (llmstxt.org proposal): a plain-language map of the site. Cheap to
// provide; no engine is confirmed to rely on it, so it is a supplement only.
export function llmsTxt(site) {
  const { origin } = config();
  const p = site.profile || {};
  const c = site.contactInfo || {};
  const out = [];
  out.push(`# ${p.name || 'Idris Paul Kwaya'}`, '');
  out.push(`> ${plain(p.title)} based in Phoenix, Arizona. ${plain(p.bio)}`, '');
  out.push(`Works with local businesses in Phoenix in person and with clients across the United States remotely. Also runs ${plain(site.agency?.brandName || site.agency?.name)}.`, '');
  out.push('## Services', '');
  for (const s of SERVICES) out.push(`- [${s.name}](${origin}/services/${s.slug}): ${s.metaDescription}`);
  out.push('', '## Projects', '');
  for (const pr of site.projects || []) {
    if (!projectInfo(site, pr).indexable) continue;
    out.push(`- [${pr.title}](${origin}/projects/${projectSlug(pr.id)}): ${plain(pr.shortDesc || pr.desc)}`);
  }
  const articles = publishedArticles();
  if (articles.length) {
    out.push('', '## Guides', '');
    for (const a of articles) out.push(`- [${a.data.title}](${origin}/insights/${a.slug}): ${a.data.metaDescription}`);
  }
  out.push('', '## Contact', '');
  if (c.email) out.push(`- Email: ${c.email}`);
  if (c.phone) out.push(`- Phone: ${c.phone}`);
  out.push(`- Contact form: ${origin}/#contact`);
  if (p.linkedin) out.push(`- LinkedIn: ${p.linkedin}`);
  if (p.github) out.push(`- GitHub: ${p.github}`);
  out.push('');
  return out.join('\n');
}

// Submit (or re-submit) the sitemap to an engine when it has never succeeded
// there, or when pages were added/removed since the last successful submission.
// A failed attempt (e.g. 403 before the owner granted permission) is retried.
export function shouldSubmitSitemap(lastResult, dirty) {
  if (!lastResult?.ok) return true;
  return Boolean(dirty?.at && dirty.at > lastResult.at);
}
