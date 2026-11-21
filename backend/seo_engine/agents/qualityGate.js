// Mandatory content quality gate. A page that fails ANY check is never
// published; it is stored as a draft with the reasons. Checks are
// deterministic so they cannot be talked around by generated text.
import { SERVICES, SERVICE_BY_SLUG } from '../catalog.js';
import { evidenceCorpus, numbersIn } from '../evidence.js';

// Claims the site can never back up, whatever the wording.
const BANNED = [
  [/\$\s?\d/, 'contains a price'],
  [/\b\d+(?:\.\d+)?\s?(?:usd|dollars)\b/i, 'contains a price'],
  [/\bguarantee[sd]?\b/i, 'contains a guarantee'],
  [/#\s?1\b|\bnumber one\b|\bbest (?:in|web|ai|seo|developer|agency)\b|\btop[- ]rated\b|\baward[- ]winning\b/i, 'superlative ranking claim'],
  [/\b(?:rank|ranking) (?:first|#1|on the first page|on page one)\b/i, 'ranking promise'],
  [/\bhundreds of (?:clients|customers|businesses)\b|\bthousands of (?:clients|customers|businesses)\b/i, 'unsupported client-count claim'],
  [/\btestimonial\b/i, 'testimonial reference'],
  [/\bwithin \d+ (?:days|weeks|hours)\b/i, 'turnaround commitment'],
  [/\blegal advice\b|\bcompliance (?:is )?guaranteed\b|\bfully compliant\b/i, 'legal/compliance commitment'],
  [/\b(?:lorem ipsum|placeholder|tbd|coming soon|insert [a-z ]+ here)\b/i, 'placeholder text']
];

const STOP = new Set('a an and are as at be by can do does for from how i in is it me my of on or our that the this to vs what when where which who why with you your'.split(' '));

export function tokens(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
}

export function jaccard(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function shingles(text, n = 5) {
  const t = tokens(text);
  const out = new Set();
  for (let i = 0; i + n <= t.length; i += 1) out.add(t.slice(i, i + n).join(' '));
  return out;
}

export function overlap(a, b) {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter += 1;
  return inter / Math.min(A.size, B.size);
}

export function articleText(a) {
  return [a.title, a.summary, ...(a.sections || []).flatMap((s) => [s.heading, ...(s.paragraphs || []), ...(s.bullets || [])]), ...(a.faqs || []).flatMap((f) => [f.q, f.a])].join('\n');
}

// Small counts like "3 steps" are allowed; any other figure must appear in the
// site's own evidence (profile, projects, experience, catalog).
function unsupportedNumbers(text, evidenceNumbers) {
  const bad = [];
  for (const m of String(text).matchAll(/\d[\d,]*(?:\.\d+)?\s*(%|\+|k\b|m\b|x\b|ms\b)?/gi)) {
    const raw = m[0].trim();
    const n = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
    const unit = (m[1] || '').toLowerCase();
    if (!unit && Number(n) <= 12 && !n.includes('.')) continue;
    if (/^(19|20)\d{2}$/.test(n) && !unit) continue; // years
    if (!evidenceNumbers.has(n)) bad.push(raw);
  }
  return [...new Set(bad)];
}

export function existingTargets({ articles = [] } = {}) {
  const targets = SERVICES.map((s) => ({ id: `service:${s.slug}`, keywords: [s.primaryKeyword, ...s.secondaryKeywords], title: s.title, text: s.lead }));
  for (const a of articles) targets.push({ id: a.id, keywords: [a.data.primaryKeyword, ...(a.data.secondaryKeywords || [])].filter(Boolean), title: a.data.title, text: articleText(a.data) });
  return targets;
}

// article: { title, metaDescription, h1, primaryKeyword, secondaryKeywords, serviceSlug, summary, sections, faqs, relatedProjects, claims:[{text, evidenceIds}] }
// ctx: { site, evidenceIds:Set, articles (published, excluding self), validPaths:Set, factCheck:{unsupported:[]} }
export function checkArticle(article, ctx) {
  const failures = [];
  const warnings = [];
  const fail = (check, detail) => failures.push({ check, detail });
  const text = articleText(article);
  const words = tokens(text).length;

  // 1. Structure and metadata
  if (!article.title || article.title.length < 20 || article.title.length > 65) fail('metadata', `title length ${article.title?.length || 0} (needs 20-65)`);
  if (!article.metaDescription || article.metaDescription.length < 70 || article.metaDescription.length > 160) fail('metadata', `meta description length ${article.metaDescription?.length || 0} (needs 70-160)`);
  if (!Array.isArray(article.sections) || article.sections.length < 3) fail('depth', 'fewer than 3 sections');

  // 2. Service relevance
  if (!SERVICE_BY_SLUG[article.serviceSlug]) fail('service-relevance', `unknown service "${article.serviceSlug}"`);

  // 3. Depth
  if (words < 450) fail('depth', `only ${words} content words (minimum 450)`);

  // 4. Distinct intent / cannibalization
  const targets = existingTargets({ articles: ctx.articles || [] });
  for (const t of targets) {
    for (const k of t.keywords) {
      const sim = jaccard(article.primaryKeyword, k);
      if (sim >= 0.6) fail('cannibalization', `primary keyword "${article.primaryKeyword}" overlaps "${k}" on ${t.id} (similarity ${sim.toFixed(2)})`);
    }
    if (jaccard(article.title, t.title) >= 0.6) fail('cannibalization', `title too similar to ${t.id}`);
  }

  // 5. Originality / duplication
  for (const a of ctx.articles || []) {
    const o = overlap(text, articleText(a.data));
    if (o >= 0.2) fail('duplication', `shares ${(o * 100).toFixed(0)}% of 5-word phrases with ${a.id}`);
  }

  // 6. Unsupported claims (deterministic)
  for (const [re, why] of BANNED) if (re.test(text) || re.test(article.metaDescription || '')) fail('unsupported-claim', why);
  const evidenceNums = numbersIn(evidenceCorpus(ctx.site));
  const badNums = unsupportedNumbers(`${text}\n${article.metaDescription || ''}`, evidenceNums);
  if (badNums.length) {
    // Owner-written articles: the owner is the source of truth, but every figure
    // not already on the site must be explicitly confirmed before publishing.
    if (ctx.authoredByOwner && ctx.figuresConfirmed) warnings.push(`figures confirmed by the owner (not elsewhere on the site): ${badNums.join(', ')}`);
    else if (ctx.authoredByOwner) fail('confirm-figures', `these figures aren't on your site yet; tick "I confirm these figures are true" to publish: ${badNums.join(', ')}`);
    else fail('unsupported-claim', `figures not found in site evidence: ${badNums.join(', ')}`);
  }

  // 7. Factual accuracy: every declared claim must cite real evidence ids,
  //    and an independent fact-check pass must find nothing unsupported.
  const claims = Array.isArray(article.claims) ? article.claims : [];
  for (const c of claims) {
    const ids = (c.evidenceIds || []).filter((id) => ctx.evidenceIds.has(id));
    if (!ids.length) fail('factual-accuracy', `claim without valid evidence: "${String(c.text).slice(0, 80)}"`);
  }
  if (ctx.factCheck && Array.isArray(ctx.factCheck.unsupported) && ctx.factCheck.unsupported.length) {
    fail('factual-accuracy', `fact-check flagged: ${ctx.factCheck.unsupported.map((u) => `"${String(u).slice(0, 80)}"`).join('; ')}`);
  }
  // An owner-written article is vouched for by its author; machine drafts need the fact-check.
  if (!ctx.factCheck && !ctx.authoredByOwner) fail('factual-accuracy', 'independent fact-check pass did not run');

  // 8. Fabricated customer information: client/org names must exist in evidence
  const knownOrgs = new Set((ctx.site.projects || []).map((p) => p.title.toLowerCase()).concat((ctx.site.experience || []).map((e) => String(e.company).toLowerCase())));
  for (const m of text.matchAll(/\b(?:client|customer|company) (?:called|named) ([A-Z][\w&' ]+)/g)) {
    if (![...knownOrgs].some((o) => o.includes(m[1].toLowerCase()))) fail('fabricated-customer', `unknown organization "${m[1]}"`);
  }

  // 9. Internal links: must resolve, and must link to its service page
  const links = [...text.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1].split('#')[0]);
  for (const l of links) if (!ctx.validPaths.has(l)) fail('internal-links', `broken internal link ${l}`);
  if (article.serviceSlug && !links.includes(`/services/${article.serviceSlug}`)) warnings.push('no in-body link to its service page (one is added in the page template)');
  for (const id of article.relatedProjects || []) {
    if (!(ctx.site.projects || []).some((p) => p.id === id)) fail('internal-links', `related project "${id}" does not exist`);
  }

  return { passed: failures.length === 0, failures, warnings, words, unverifiedFigures: badNums };
}

// Lighter gate for metadata-only changes (title/description experiments).
export function checkMeta({ title, metaDescription }, ctx) {
  const failures = [];
  if (title !== undefined && (title.length < 20 || title.length > 65)) failures.push({ check: 'metadata', detail: `title length ${title.length}` });
  if (metaDescription !== undefined && (metaDescription.length < 70 || metaDescription.length > 160)) failures.push({ check: 'metadata', detail: `description length ${metaDescription.length}` });
  const text = `${title || ''}\n${metaDescription || ''}`;
  for (const [re, why] of BANNED) if (re.test(text)) failures.push({ check: 'unsupported-claim', detail: why });
  const badNums = unsupportedNumbers(text, numbersIn(evidenceCorpus(ctx.site)));
  if (badNums.length) failures.push({ check: 'unsupported-claim', detail: `figures not in evidence: ${badNums.join(', ')}` });
  return { passed: failures.length === 0, failures };
}
