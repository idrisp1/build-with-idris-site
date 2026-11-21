// Validates JSON-LD against the official schema.org vocabulary (downloaded from
// schema.org and cached for 30 days) plus Google's documented required fields
// for the structured-data features this site uses. Every @type must be a real
// schema.org class and every property must be a real property whose domain
// includes that type (or one of its superclasses).
import { readJson, writeJson } from '../store.js';
import { fetchWithRetry } from '../integrations/http.js';

export const VOCAB_URL = 'https://schema.org/version/latest/schemaorg-current-https.jsonld';
const CACHE = 'cache/schemaorg-vocab.json';
const MAX_AGE_MS = 30 * 24 * 3600_000;

const strip = (id) => String(id || '').replace(/^schema:/, '').replace(/^https?:\/\/schema\.org\//, '');
const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

export function compileVocab(jsonld) {
  const classes = {};
  const props = {};
  for (const n of jsonld['@graph'] || []) {
    const types = arr(n['@type']);
    const id = strip(n['@id']);
    if (types.includes('rdfs:Class')) classes[id] = arr(n['rdfs:subClassOf']).map((x) => strip(x['@id']));
    if (types.includes('rdf:Property')) props[id] = arr(n['schema:domainIncludes']).map((x) => strip(x['@id']));
  }
  return { classes, props };
}

export async function loadVocab({ fetchImpl, force = false } = {}) {
  const cached = readJson(CACHE, null);
  if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < MAX_AGE_MS) return cached;
  const res = await fetchWithRetry(VOCAB_URL, { headers: { accept: 'application/ld+json' } }, { attempts: 2, timeoutMs: 60_000, fetchImpl });
  if (!res.ok) {
    if (cached) return cached; // stale-but-valid beats nothing
    throw new Error(`schema.org vocabulary download failed: HTTP ${res.status}`);
  }
  const vocab = { fetchedAt: new Date().toISOString(), ...compileVocab(await res.json()) };
  writeJson(CACHE, vocab);
  return vocab;
}

function ancestors(vocab, type, seen = new Set()) {
  if (seen.has(type)) return seen;
  seen.add(type);
  for (const sup of vocab.classes[type] || []) ancestors(vocab, sup, seen);
  return seen;
}

function googleChecks(node, where, issues) {
  const t = arr(node['@type']);
  const need = (prop, why) => { if (node[prop] === undefined || node[prop] === '') issues.push({ severity: 'error', where, detail: `${t.join('/')} missing required "${prop}" (${why})` }); };
  if (t.includes('BreadcrumbList')) {
    const items = arr(node.itemListElement);
    if (!items.length) issues.push({ severity: 'error', where, detail: 'BreadcrumbList has no itemListElement' });
    items.forEach((li, i) => {
      for (const p of ['position', 'name', 'item']) if (li[p] === undefined) issues.push({ severity: 'error', where, detail: `BreadcrumbList item ${i + 1} missing "${p}" (Google breadcrumb requirement)` });
    });
  }
  if (t.includes('Article')) { need('headline', 'Google Article'); need('author', 'Google Article'); need('datePublished', 'Google Article'); }
  if (t.includes('Person') || t.includes('WebSite') || t.includes('Service') || t.includes('ProfessionalService')) need('name', 'entity name');
  if (t.includes('ProfessionalService')) need('address', 'Google local business');
  if (t.includes('FAQPage')) {
    for (const q of arr(node.mainEntity)) if (!q.name || !q.acceptedAnswer?.text) issues.push({ severity: 'error', where, detail: 'FAQPage question missing name or acceptedAnswer.text' });
  }
}

export function validateNode(vocab, node, where, issues = []) {
  if (!node || typeof node !== 'object') return issues;
  if (Array.isArray(node)) { node.forEach((n) => validateNode(vocab, n, where, issues)); return issues; }
  const types = arr(node['@type']);
  const known = new Set();
  for (const t of types) {
    if (!vocab.classes[t]) issues.push({ severity: 'error', where, detail: `unknown schema.org type "${t}"` });
    else ancestors(vocab, t, known);
  }
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('@')) continue;
    const domains = vocab.props[k];
    if (!domains) { issues.push({ severity: 'error', where, detail: `unknown schema.org property "${k}"${types.length ? ` on ${types.join('/')}` : ''}` }); continue; }
    if (types.length && known.size && !domains.some((d) => known.has(d))) {
      issues.push({ severity: 'warning', where, detail: `property "${k}" is not expected on ${types.join('/')} (schema.org domain: ${domains.join(', ')})` });
    }
    // Recurse into nested entities; a bare {"@id": ...} reference has nothing to check.
    for (const child of arr(v)) {
      if (child && typeof child === 'object' && Object.keys(child).some((ck) => ck !== '@id')) validateNode(vocab, child, where, issues);
    }
  }
  if (types.length) googleChecks(node, where, issues);
  return issues;
}

export function validateJsonLd(vocab, jsonText, where) {
  let doc;
  try { doc = JSON.parse(jsonText); } catch { return [{ severity: 'error', where, detail: 'JSON-LD is not valid JSON' }]; }
  const issues = [];
  if (doc['@context'] !== 'https://schema.org') issues.push({ severity: 'warning', where, detail: `unexpected @context ${doc['@context']}` });
  for (const node of arr(doc['@graph'] || doc)) validateNode(vocab, node, where, issues);
  return issues;
}
