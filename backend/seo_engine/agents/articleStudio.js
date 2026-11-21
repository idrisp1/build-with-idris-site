// Article studio: owner-written articles (usually started from a research
// brief). The owner writes; the system checks and publishes:
//   editor input -> normalized article -> mandatory quality gate (owner mode)
//   -> draft or published page (versioned, rollback-able) -> sitemap + IndexNow.
// Prices, guarantees, superlatives, thin content, keyword cannibalization,
// duplicates and broken links always block publishing. Figures that aren't
// already on the site need the owner's explicit confirmation.
import { SERVICE_BY_SLUG } from '../catalog.js';
import { getPage, savePageVersion, currentData } from '../pages.js';
import { readJson, writeJson } from '../store.js';
import { publishedArticles } from '../render/pages.js';
import { checkArticle } from './qualityGate.js';

const clean = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 8).join('-').slice(0, 60);
}

// A section body is plain text: blank lines separate paragraphs, lines that
// start with "- " or "* " become a bullet list.
export function parseBody(body) {
  const paragraphs = [];
  const bullets = [];
  for (const block of String(body || '').split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^[-*]\s+/.test(l))) bullets.push(...lines.map((l) => l.replace(/^[-*]\s+/, '')));
    else paragraphs.push(lines.join(' '));
  }
  return { paragraphs, bullets };
}

export function normalizeArticle(input) {
  const title = clean(input.title, 120);
  const sections = (Array.isArray(input.sections) ? input.sections : []).slice(0, 15).map((s) => ({
    heading: clean(s.heading, 120),
    ...parseBody(clean(s.body ?? [...(s.paragraphs || []), ...(s.bullets || []).map((b) => `- ${b}`)].join('\n\n'), 8000))
  })).filter((s) => s.heading || s.paragraphs.length || s.bullets.length);
  return {
    title,
    h1: clean(input.h1, 120) || title,
    metaDescription: clean(input.metaDescription, 300),
    primaryKeyword: clean(input.primaryKeyword, 120).toLowerCase(),
    secondaryKeywords: (Array.isArray(input.secondaryKeywords) ? input.secondaryKeywords : String(input.secondaryKeywords || '').split(',')).map((k) => clean(k, 80).toLowerCase()).filter(Boolean).slice(0, 10),
    serviceSlug: clean(input.serviceSlug, 80),
    summary: clean(input.summary, 400),
    sections,
    faqs: (Array.isArray(input.faqs) ? input.faqs : []).map((f) => ({ q: clean(f.q, 200), a: clean(f.a, 1500) })).filter((f) => f.q && f.a).slice(0, 10),
    relatedProjects: (Array.isArray(input.relatedProjects) ? input.relatedProjects : []).map((x) => clean(x, 80)).filter(Boolean).slice(0, 6),
    authoredBy: 'owner'
  };
}

export function checkOwnerArticle(input, { site, validPaths, figuresConfirmed = false, slug }) {
  const article = normalizeArticle(input);
  const finalSlug = slugify(slug || input.slug || article.title);
  const articles = publishedArticles().filter((a) => a.slug !== finalSlug); // editing: don't compare with itself
  const gate = checkArticle(article, { site, evidenceIds: new Set(), articles, validPaths, authoredByOwner: true, figuresConfirmed: Boolean(figuresConfirmed) });
  if (!finalSlug) gate.failures.push({ check: 'metadata', detail: 'the title produces an empty URL slug' });
  const existing = getPage(`article:${finalSlug}`);
  if (existing && !input.editing) gate.failures.push({ check: 'duplication', detail: `an article already exists at /insights/${finalSlug}; open it to edit instead` });
  if (!SERVICE_BY_SLUG[article.serviceSlug]) gate.failures.push({ check: 'service-relevance', detail: 'choose the service this article supports' });
  gate.passed = gate.failures.length === 0;
  return { article, slug: finalSlug, gate };
}

export function saveOwnerArticle(input, { site, validPaths, publish = false, figuresConfirmed = false, briefId = null }) {
  const { article, slug, gate } = checkOwnerArticle(input, { site, validPaths, figuresConfirmed });
  const pageId = `article:${slug}`;
  const existing = getPage(pageId);
  const isLive = existing?.status === 'published';
  let status;
  if (publish) {
    if (!gate.passed) {
      // Never publish failing content. A live article stays exactly as it is; a
      // new one is kept as a draft so the owner's writing is never lost.
      if (isLive) return { slug, status: 'published (unchanged)', published: false, gate };
      savePageVersion(pageId, { kind: 'article', status: 'draft', data: { ...article, gate, briefId }, by: 'owner', reason: `Publish blocked by the quality gate (${gate.failures.map((f) => f.check).join(', ')}); kept as draft`, changeType: 'article-draft' });
      return { slug, status: 'draft', published: false, gate };
    }
    status = 'published';
  } else {
    // Saving a draft over a live article would change the live page.
    if (isLive) return { slug, status: 'published (unchanged)', published: false, gate, error: 'This article is live. Use "Publish update" (it runs the quality check first).' };
    status = 'draft';
  }
  savePageVersion(pageId, {
    kind: 'article', status, data: { ...article, gate, briefId },
    by: 'owner',
    reason: status === 'published' ? `Owner article ${isLive ? 'updated' : 'published'}${briefId ? ` (from brief ${briefId})` : ''}; passed the quality gate` : `Owner draft saved${briefId ? ` (from brief ${briefId})` : ''}`,
    changeType: status === 'published' ? (isLive ? 'article-update' : 'article-new') : 'article-draft'
  });
  if (briefId) {
    const brief = readJson(`briefs/${briefId}.json`, null);
    if (brief) writeJson(`briefs/${briefId}.json`, { ...brief, articleId: pageId, articleStatus: status, updatedAt: new Date().toISOString() });
  }
  return { slug, status, published: status === 'published', url: `/insights/${slug}`, gate };
}

export function loadArticleForEditing(slug) {
  const page = getPage(`article:${slugify(slug)}`);
  const data = currentData(page);
  if (!data) return null;
  return {
    slug: slugify(slug), status: page.status, versions: page.versions.length,
    article: {
      ...data,
      sections: (data.sections || []).map((s) => ({ heading: s.heading, body: [...(s.paragraphs || []), ...(s.bullets || []).length ? [(s.bullets || []).map((b) => `- ${b}`).join('\n')] : []].join('\n\n') }))
    }
  };
}
