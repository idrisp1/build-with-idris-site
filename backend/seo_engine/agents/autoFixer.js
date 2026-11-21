// Automatic, verified fixes for technical SEO issues the auditor finds.
// Scope (safe, reversible, deterministic):
//   - title too long / missing / duplicated       -> metadata override
//   - description too short / long / missing / duplicated -> metadata override
// Every fix: saved as a new page version with the reason -> page re-rendered and
// re-checked -> if the issue persists or anything else got worse, the fix is
// rolled back automatically. Issues that need the owner (e.g. a client's
// broken external site) are reported, never "fixed" by editing their content.
import { SERVICE_BY_SLUG } from '../catalog.js';
import { getPage, savePageVersion, setPageStatus, currentData } from '../pages.js';
import { appendJsonl } from '../store.js';
import { parseHtml } from './technicalAuditor.js';
import { pageForPath, titleCase } from './contentOptimizer.js';
import { checkMeta } from './qualityGate.js';
import { findProjectBySlug } from '../render/pages.js';

export const TITLE_MAX = 60;
export const DESC_MIN = 70;
export const DESC_MAX = 160;

const FIXABLE = new Set(['title', 'meta-description', 'duplicate-title', 'duplicate-description']);

export function clip(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  return `${cut.replace(/\s+\S*$/, '').replace(/[,;:\-–—]$/, '')}…`;
}

// Source text for descriptions: the page's own verified copy.
function pageText(path, site) {
  let m = path.match(/^\/services\/([a-z0-9-]+)$/);
  if (m && SERVICE_BY_SLUG[m[1]]) { const s = SERVICE_BY_SLUG[m[1]]; return [s.lead, `${s.name}: ${s.included.map((i) => i.title).join(', ')}.`]; }
  m = path.match(/^\/projects\/([a-z0-9-]+)$/);
  if (m) { const p = findProjectBySlug(site, m[1]); if (p) return [p.desc || p.shortDesc, `${p.title}: ${(p.tags || []).join(', ')}.`]; }
  if (path === '/') return [site.profile?.bio, site.profile?.headline];
  if (path === '/services') return ['AI development, automation, custom software, website design, SEO and data services from Phoenix-based AI Systems Engineer ' + (site.profile?.name || 'Idris Paul Kwaya') + ', for U.S. clients.'];
  return [];
}

export function titleCandidates(path, site, current) {
  const name = site.profile?.name || 'Idris Paul Kwaya';
  const out = [];
  const base = String(current || '').split(' | ')[0].trim();
  if (base) out.push(`${base} | ${name}`, base);
  const m = path.match(/^\/services\/([a-z0-9-]+)$/);
  if (m && SERVICE_BY_SLUG[m[1]]) { const s = SERVICE_BY_SLUG[m[1]]; out.push(`${titleCase(s.primaryKeyword)} | ${name}`, `${s.name} | ${name}`, s.name); }
  const pm = path.match(/^\/projects\/([a-z0-9-]+)$/);
  if (pm) { const p = findProjectBySlug(site, pm[1]); if (p) out.push(`${p.title} Case Study | ${name}`, `${p.title} | ${name}`, `${p.title} Case Study`); }
  if (path === '/services') out.push(`Services | ${name}`, 'AI, Software, Web Design & SEO Services');
  return out.filter((t) => t.length >= 20 && t.length <= TITLE_MAX);
}

export function descriptionCandidates(path, site) {
  const texts = pageText(path, site).filter(Boolean);
  const out = [];
  for (const t of texts) out.push(clip(t, DESC_MAX - 5));
  out.push(clip(texts.join(' '), DESC_MAX - 5));
  return out.filter((d) => d.length >= DESC_MIN && d.length <= DESC_MAX);
}

// issues: technical report issues; allTitles/allDescs: maps value -> [paths]
export function planFixes({ issues, site, pages }) {
  const plans = new Map();
  const usedTitles = new Set(Object.values(pages).map((p) => p.title));
  const usedDescs = new Set(Object.values(pages).map((p) => p.description));
  for (const issue of issues) {
    if (!FIXABLE.has(issue.check) || !pages[issue.path]) continue;
    const target = pageForPath(issue.path, site);
    if (!target || target.article) continue;
    const cur = pages[issue.path];
    const plan = plans.get(issue.path) || { path: issue.path, pageId: target.pageId, issues: [], patch: {} };
    plan.issues.push(`${issue.check}: ${issue.detail}`);
    if (issue.check === 'title' || issue.check === 'duplicate-title') {
      const pick = titleCandidates(issue.path, site, cur.title).find((t) => t !== cur.title && !usedTitles.has(t) && checkMeta({ title: t }, { site }).passed);
      if (pick) { plan.patch.title = pick; usedTitles.add(pick); }
    } else {
      const pick = descriptionCandidates(issue.path, site).find((d) => d !== cur.description && !usedDescs.has(d) && checkMeta({ metaDescription: d }, { site }).passed);
      if (pick) { plan.patch.metaDescription = pick; usedDescs.add(pick); }
    }
    plans.set(issue.path, plan);
  }
  return [...plans.values()];
}

function stillBroken(parsed, patch) {
  const problems = [];
  if (patch.title && (parsed.title !== patch.title.replace(/&/g, '&amp;').replace(/'/g, '&#39;') && parsed.title !== patch.title)) problems.push('title not applied');
  if (patch.title && parsed.title.length > 70) problems.push('title still too long');
  if (patch.metaDescription && (!parsed.description || parsed.description.length < 50 || parsed.description.length > 170)) problems.push('description still out of range');
  if (parsed.h1s.length !== 1) problems.push('h1 count changed');
  if (/noindex/i.test(parsed.robots || '')) problems.push('page became noindex');
  for (const b of parsed.jsonLd) { try { JSON.parse(b); } catch { problems.push('JSON-LD broke'); } }
  return problems;
}

export function applyFixes({ plans, renderPath }) {
  const results = [];
  for (const plan of plans) {
    if (!Object.keys(plan.patch).length) {
      results.push({ path: plan.path, status: 'needs-owner', issues: plan.issues, reason: 'no valid deterministic fix available' });
      appendJsonl('history/autofix.jsonl', { at: new Date().toISOString(), ...results.at(-1) });
      continue;
    }
    const before = getPage(plan.pageId);
    const previous = before && before.status === 'published' ? currentData(before) : null;
    const reason = `Auto-fix: ${plan.issues.join('; ')}`;
    savePageVersion(plan.pageId, { kind: 'override', status: 'published', data: { ...(previous || {}), ...plan.patch }, by: 'auto-fixer', reason, changeType: 'autofix' });
    const html = renderPath(plan.path);
    const problems = html ? stillBroken(parseHtml(html), plan.patch) : ['page did not render'];
    if (problems.length) {
      if (previous) savePageVersion(plan.pageId, { kind: 'override', data: previous, by: 'auto-fixer', reason: `Auto-fix rolled back: ${problems.join(', ')}`, changeType: 'autofix-rollback' });
      else setPageStatus(plan.pageId, 'archived', { by: 'auto-fixer', reason: `Auto-fix rolled back: ${problems.join(', ')}` });
      results.push({ path: plan.path, status: 'rolled-back', problems, patch: plan.patch });
    } else {
      results.push({ path: plan.path, status: 'fixed-and-verified', patch: plan.patch, issues: plan.issues });
    }
    appendJsonl('history/autofix.jsonl', { at: new Date().toISOString(), ...results.at(-1) });
  }
  return results;
}

// External links on client sites can't be edited by this site; classify them
// so the report says what the owner should tell the client.
export function classifyExternal(issue) {
  const d = String(issue.detail || '');
  if (/certificate|CERT_|UNABLE_TO_VERIFY|self[- ]signed|SEC_E_/i.test(d)) return 'tls-certificate-problem';
  if (/HTTP 4\d\d/.test(d)) return 'page-not-found-or-blocked';
  if (/HTTP 5\d\d/.test(d)) return 'server-error';
  if (/ENOTFOUND|EAI_AGAIN/.test(d)) return 'domain-not-resolving';
  return 'unreachable';
}
