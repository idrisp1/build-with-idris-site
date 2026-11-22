// Tests for the second implementation pass: Google OAuth, verified auto-fixes,
// schema.org vocabulary validation, description experiments, Bing URL
// submission fallback + quota, Bing keyword volumes, PageSpeed/CWV, heading
// order and the early hero reveal (LCP).
import { test, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useDataDir, mockServer, startServer, writeGscDay, isoDay, BACKEND } from './helpers.mjs';

const oauth = await import('../../backend/seo_engine/integrations/googleOAuth.js');
const gsc = await import('../../backend/seo_engine/integrations/gsc.js');
const bing = await import('../../backend/seo_engine/integrations/bing.js');
const pagespeed = await import('../../backend/seo_engine/integrations/pagespeed.js');
const autoFixer = await import('../../backend/seo_engine/agents/autoFixer.js');
const schema = await import('../../backend/seo_engine/agents/schemaValidator.js');
const content = await import('../../backend/seo_engine/agents/contentOptimizer.js');
const keywordIntel = await import('../../backend/seo_engine/agents/keywordIntelligence.js');
const { parseHtml } = await import('../../backend/seo_engine/agents/technicalAuditor.js');
const pages = await import('../../backend/seo_engine/pages.js');
const learning = await import('../../backend/seo_engine/learning.js');
const { createSeoEngine } = await import('../../backend/seo_engine/index.js');
process.env.BING_MIN_INTERVAL_MS = '0';
const { getContent } = await import('../../backend/lib/contentStore.js');
const { loadSite } = await import('../../backend/seo_engine/evidence.js');

const site = loadSite(getContent);
let dir;
beforeEach(() => {
  dir = useDataDir();
  process.env.FRONTEND_ORIGIN = 'https://buildwithidris.com';
  process.env.SESSION_SECRET = 'test-secret-for-encryption';
});

// ---------------- Google OAuth ----------------
test('OAuth: tokens are encrypted at rest (AES-GCM) and tampering is detected', () => {
  oauth.saveTokens({ refresh_token: 'rt-SECRET-123', access_token: 'at-SECRET-456', expiry_date: 1 });
  const raw = fs.readFileSync(path.join(dir, 'secure', 'google-oauth.json'), 'utf8');
  assert.doesNotMatch(raw, /SECRET/, 'no plaintext token on disk');
  assert.equal(oauth.loadTokens().refresh_token, 'rt-SECRET-123');
  const rec = JSON.parse(raw);
  rec.box.data = Buffer.from('tampered').toString('base64');
  fs.writeFileSync(path.join(dir, 'secure', 'google-oauth.json'), JSON.stringify(rec));
  assert.equal(oauth.loadTokens(), null, 'tampered ciphertext is rejected');
});

test('OAuth: consent URL requests offline access + Search Console scope; state is single-use', () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid.apps.googleusercontent.com';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csecret';
  const url = new URL(oauth.startUrl());
  assert.equal(url.host, 'accounts.google.com');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.match(url.searchParams.get('scope'), /auth\/webmasters$/);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://buildwithidris.com/api/admin/seo/google/oauth/callback');
  const state = url.searchParams.get('state');
  assert.equal(oauth.consumeState(state), true);
  assert.equal(oauth.consumeState(state), false, 'replayed state is rejected');
  assert.equal(oauth.consumeState('forged'), false);
});

test('OAuth: code exchange stores tokens; Search Console then prefers the owner connection over the service account', async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'; process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'cs';
  process.env.GSC_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: 'k' });
  assert.equal(gsc.authMode(), 'service-account');
  await oauth.exchangeCode('code-1', { oauthClient: { getToken: async () => ({ tokens: { refresh_token: 'rt', access_token: 'at', scope: 'https://www.googleapis.com/auth/webmasters' } }) } });
  assert.equal(gsc.authMode(), 'oauth');
  assert.equal(oauth.status().connected, true);
  // refresh token is kept when Google omits it on a later exchange
  await oauth.exchangeCode('code-2', { oauthClient: { getToken: async () => ({ tokens: { access_token: 'at2' } }) } });
  assert.equal(oauth.loadTokens().refresh_token, 'rt');
  delete process.env.GSC_SERVICE_ACCOUNT_JSON; delete process.env.GOOGLE_OAUTH_CLIENT_ID; delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
});

test('OAuth routes are admin-only and reject a forged state', async () => {
  const srv = await startServer({ GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'cs' });
  try {
    assert.equal((await fetch(`${srv.base}/api/admin/seo/google/oauth/start`, { redirect: 'manual' })).status, 401);
    const { login } = await import('./helpers.mjs');
    const cookie = await login(srv.base);
    const start = await fetch(`${srv.base}/api/admin/seo/google/oauth/start`, { redirect: 'manual', headers: { cookie } });
    assert.equal(start.status, 302);
    assert.match(start.headers.get('location'), /^https:\/\/accounts\.google\.com\//);
    const forged = await fetch(`${srv.base}/api/admin/seo/google/oauth/callback?state=forged&code=x`, { headers: { cookie } });
    assert.equal(forged.status, 400);
  } finally { await srv.stop(); }
});

// ---------------- auto-fixer ----------------
function engine() {
  return createSeoEngine({ getContent, adminAuth: { requireAdmin: (_q, _r, n) => n() }, indexHtmlPath: path.join(BACKEND, '..', 'index.html'), port: 0 });
}

test('auto-fix: an over-long title and a short description are fixed, verified on the re-rendered page, and versioned', () => {
  const e = engine();
  const html = e.renderPath('/services');
  const parsed = parseHtml(html);
  const issues = [
    { severity: 'warning', path: '/services', check: 'title', detail: `${parsed.title.length} chars` },
    { severity: 'warning', path: '/services/ai-development', check: 'meta-description', detail: '40 chars' }
  ];
  const pagesMap = { '/services': parsed, '/services/ai-development': { ...parseHtml(e.renderPath('/services/ai-development')), description: 'too short' } };
  const plans = autoFixer.planFixes({ issues, site, pages: pagesMap });
  const results = autoFixer.applyFixes({ plans, renderPath: (p) => e.renderPath(p) });
  assert.deepEqual(results.map((r) => r.status), ['fixed-and-verified', 'fixed-and-verified'], JSON.stringify(results));
  const fixedTitle = parseHtml(e.renderPath('/services')).title;
  assert.ok(fixedTitle.length <= 60, fixedTitle);
  const desc = parseHtml(e.renderPath('/services/ai-development')).description;
  assert.ok(desc.length >= 70 && desc.length <= 160);
  assert.equal(pages.getPage('page:services').versions.at(-1).by, 'auto-fixer');
  assert.match(learning.listChanges()[0].reason, /^Auto-fix:/);
});

test('auto-fix regression: fixed titles render with single escaping ("&" shows as "&", never "&amp;")', () => {
  const e = engine();
  const parsed = parseHtml(e.renderPath('/services/seo-digital-marketing'));
  const plans = autoFixer.planFixes({ issues: [{ path: '/services/seo-digital-marketing', check: 'title', detail: '66 chars' }], site, pages: { '/services/seo-digital-marketing': parsed } });
  assert.doesNotMatch(plans[0].patch.title, /&amp;/, 'patch is plain text');
  const [r] = autoFixer.applyFixes({ plans, renderPath: (p) => e.renderPath(p) });
  assert.equal(r.status, 'fixed-and-verified');
  const raw = e.renderPath('/services/seo-digital-marketing');
  assert.doesNotMatch(raw, /<title>[^<]*&amp;amp;/, 'no double-escaped entity in the HTML');
  assert.match(raw, /<title>SEO &amp; Digital Marketing Services in Phoenix<\/title>/);
});

test('self-healing: a double-escaped override (the production bug) is detected by the audit and repaired by the auto-fixer', async () => {
  const e = engine();
  pages.savePageVersion('page:services', { kind: 'override', status: 'published', data: { title: 'Services: AI, Software, Web Design &amp; SEO in Phoenix' }, reason: 'reproduce bug' });
  const parsed = parseHtml(e.renderPath('/services'));
  assert.equal(parsed.title, 'Services: AI, Software, Web Design &amp; SEO in Phoenix', 'users would see the entity');
  const { audit } = await import('../../backend/seo_engine/agents/technicalAuditor.js');
  const fakeFetch = async (url) => {
    const p = new URL(url).pathname;
    const html = p === '/services' ? e.renderPath('/services') : '';
    return { status: html ? 200 : 404, text: async () => html, headers: new Map() };
  };
  const report = await audit({ baseUrl: 'http://x', paths: ['/services'], fetchImpl: fakeFetch });
  const issue = report.issues.find((i) => i.path === '/services' && i.check === 'title' && /literal HTML entity/.test(i.detail));
  assert.ok(issue, JSON.stringify(report.issues));
  const plans = autoFixer.planFixes({ issues: [issue], site, pages: report.pages ? { '/services': parsed } : {} });
  const [r] = autoFixer.applyFixes({ plans, renderPath: (p) => e.renderPath(p) });
  assert.equal(r.status, 'fixed-and-verified', JSON.stringify(r));
  assert.equal(parseHtml(e.renderPath('/services')).title, 'Services: AI, Software, Web Design & SEO in Phoenix');
});

test('auto-fix: a fix that breaks the page is rolled back automatically', () => {
  const e = engine();
  const parsed = parseHtml(e.renderPath('/services'));
  const plans = autoFixer.planFixes({ issues: [{ path: '/services', check: 'title', detail: 'long' }], site, pages: { '/services': parsed } });
  const brokenRender = (p) => e.renderPath(p).replace('</main>', '<h1>second h1</h1></main>');
  const [r] = autoFixer.applyFixes({ plans, renderPath: brokenRender });
  assert.equal(r.status, 'rolled-back');
  assert.match(r.problems.join(), /h1 count changed/);
  assert.equal(pages.getPage('page:services').status, 'archived', 'override withdrawn -> defaults restored');
});

test('missing internal links: orphan pages and case studies without a service-page link are detected', async () => {
  const { linkGraph, internalLinkIssues } = await import('../../backend/seo_engine/agents/technicalAuditor.js');
  const pagesMap = {
    '/': { links: ['/services', '/projects/a', '/projects/b'] },
    '/services': { links: ['/services/x', '/#contact'] },
    '/services/x': { links: ['/projects/a', 'https://buildwithidris.com/services'] },
    '/projects/a': { links: ['/services/x'] },
    '/projects/b': { links: ['/'] },
    '/services/lonely': { links: ['/'] }
  };
  const issues = internalLinkIssues(linkGraph(pagesMap, 'https://buildwithidris.com'), Object.keys(pagesMap));
  assert.deepEqual(issues.map((i) => `${i.check} ${i.path}`).sort(), ['missing-contextual-link /projects/b', 'orphan-page /services/lonely']);
});

test('the live site has no orphan pages and every case study is linked from a service page', async () => {
  const { audit } = await import('../../backend/seo_engine/agents/technicalAuditor.js');
  process.env.FRONTEND_ORIGIN = srv.base;
  process.env.SEO_DATA_DIR = srv.dataDir;
  const xml = await (await fetch(`${srv.base}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(srv.base, '') || '/');
  const r = await audit({ baseUrl: srv.base, paths });
  const linkIssues = r.issues.filter((i) => ['orphan-page', 'missing-contextual-link'].includes(i.check));
  assert.deepEqual(linkIssues, []);
});

test('auto-fix: client-site problems are classified for the owner, not "fixed"', () => {
  assert.equal(autoFixer.classifyExternal({ detail: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE: unable to verify the first certificate' }), 'tls-certificate-problem');
  assert.equal(autoFixer.classifyExternal({ detail: 'HTTP 404' }), 'page-not-found-or-blocked');
  assert.equal(autoFixer.classifyExternal({ detail: 'ENOTFOUND x.com' }), 'domain-not-resolving');
});

// ---------------- schema.org vocabulary validation ----------------
let vocab;
let srv;
before(async () => {
  const tmp = useDataDir();
  vocab = await schema.loadVocab(); // downloads the official vocabulary from schema.org
  process.env.SEO_DATA_DIR = tmp;
  srv = await startServer();
});
after(() => srv?.stop());

test('schema.org: every JSON-LD node on every public page uses real types and properties, and meets Google required fields', async () => {
  assert.ok(Object.keys(vocab.classes).length > 700 && Object.keys(vocab.props).length > 1300, 'vocabulary loaded');
  const xml = await (await fetch(`${srv.base}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(srv.base, '') || '/');
  for (const p of paths) {
    const parsed = parseHtml(await (await fetch(srv.base + p)).text());
    for (const block of parsed.jsonLd) {
      const issues = schema.validateJsonLd(vocab, block, p);
      assert.deepEqual(issues.filter((i) => i.severity === 'error'), [], `${p}: ${JSON.stringify(issues)}`);
      assert.deepEqual(issues, [], `${p} warnings: ${JSON.stringify(issues)}`);
    }
  }
});

test('schema.org: invented types/properties and incomplete breadcrumbs are caught', () => {
  const bad = JSON.stringify({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'MagicBusiness', name: 'x' },
    { '@type': 'Person', name: 'x', favouriteColour: 'purple' },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home' }] }
  ] });
  const details = schema.validateJsonLd(vocab, bad, '/x').map((i) => i.detail).join(' | ');
  assert.match(details, /unknown schema.org type "MagicBusiness"/);
  assert.match(details, /unknown schema.org property "favouriteColour"/);
  assert.match(details, /BreadcrumbList item 1 missing "item"/);
});

// ---------------- description experiments ----------------
test('snippet experiments alternate: after a concluded title experiment the next one changes only the description', async () => {
  for (let d = -30; d <= -1; d += 1) {
    writeGscDay(dir, isoDay(d), [{ page: 'https://buildwithidris.com/services/document-processing', clicks: 0, impressions: 60, ctr: 0, position: 5 }],
      [{ page: 'https://buildwithidris.com/services/document-processing', query: 'pdf data extraction service', clicks: 0, impressions: 60, position: 5 }]);
  }
  learning.addExperiment({ pageId: 'service:document-processing', path: '/services/document-processing', type: 'meta-title', after: 'X', startedAt: new Date(Date.now() - 80 * 86400000).toISOString() });
  learning.updateExperiment(learning.listExperiments()[0].id, { status: 'inconclusive', endedAt: new Date(Date.now() - 40 * 86400000).toISOString(), evaluation: { verdict: 'inconclusive' } });
  const performance = { findings: { lowCtr: [{ page: 'https://buildwithidris.com/services/document-processing', path: '/services/document-processing', impressions: 1680, clicks: 0, ctr: 0, position: 5 }] } };
  const [r] = await content.runSnippetExperiments({ site, performance });
  assert.equal(r.status, 'started', JSON.stringify(r));
  assert.equal(r.type, 'meta-description');
  assert.match(r.metaDescription, /^PDF Data Extraction Service: /, 'leads with the real matching query');
  assert.ok(r.metaDescription.length >= 70 && r.metaDescription.length <= 160);
  assert.deepEqual(Object.keys(pages.currentData(pages.getPage('service:document-processing'))), ['metaDescription'], 'only the description changed');
});

// ---------------- Bing: URL submission fallback, quota, keyword volumes ----------------
test('Bing URL submission respects the daily quota and falls back to the alternate method casing', async () => {
  const mock = await mockServer((req, body) => {
    if (req.url.startsWith('/GetUrlSubmissionQuota')) return { body: { d: { DailyQuota: 2, MonthlyQuota: 100 } } };
    if (req.url.startsWith('/SubmitUrlBatch')) return { status: 404, body: 'Endpoint not found' };
    if (req.url.startsWith('/SubmitUrlbatch')) return { body: { d: null } };
    return { status: 400, body: 'unexpected' };
  });
  process.env.BING_API_BASE = mock.url; process.env.BING_WEBMASTER_API_KEY = 'K1234567';
  try {
    const r = await bing.submitWithinQuota(['https://buildwithidris.com/a', 'https://buildwithidris.com/b', 'https://buildwithidris.com/c']);
    assert.equal(r.submitted, 2, 'capped at the daily quota');
    const sent = JSON.parse(mock.calls.find((c) => c.url.startsWith('/SubmitUrlbatch')).body);
    assert.deepEqual(sent.urlList, ['https://buildwithidris.com/a', 'https://buildwithidris.com/b']);
    assert.equal(sent.siteUrl, 'https://buildwithidris.com/');
  } finally { delete process.env.BING_WEBMASTER_API_KEY; await mock.close(); }
});

test('keyword intelligence records real Bing keyword volumes and uses them as measured demand', async () => {
  const mock = await mockServer((req) => {
    if (req.url.startsWith('/GetKeyword?')) return { body: { d: [{ Query: 'x', Impressions: 400, Date: '/Date(1763683200000)/' }, { Query: 'x', Impressions: 600 }] } };
    return { body: { d: [] } };
  });
  process.env.BING_API_BASE = mock.url; process.env.BING_WEBMASTER_API_KEY = 'K1234567';
  try {
    await keywordIntel.run({ bingRelatedLimit: 0, bingVolumeLimit: 2 });
    const measured = keywordIntel.dataset().keywords.filter((k) => k.measured?.bingVolume90d);
    assert.equal(measured.length, 2);
    assert.equal(measured[0].measured.bingVolume90d.impressions, 1000);
    assert.equal(measured[0].demandSource, 'measured');
    assert.equal(measured[0].demandTier, 3, '1000/10 = 100 site-share impressions -> tier 3');
  } finally { delete process.env.BING_WEBMASTER_API_KEY; await mock.close(); }
});

// ---------------- PageSpeed / Core Web Vitals ----------------
test('Core Web Vitals: lab and real-user field data are parsed and stored; quota exhaustion is reported, not hidden', async () => {
  const psi = { lighthouseResult: { categories: { performance: { score: 0.91 } }, audits: { 'largest-contentful-paint': { numericValue: 2100 }, 'cumulative-layout-shift': { numericValue: 0.0123 }, 'total-blocking-time': { numericValue: 340 }, 'first-contentful-paint': { numericValue: 1200 } } },
    loadingExperience: { overall_category: 'FAST', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1900, category: 'FAST' }, INTERACTION_TO_NEXT_PAINT: { percentile: 120, category: 'FAST' } } } };
  const ok = await mockServer(() => ({ body: psi }));
  const r = await pagespeed.run(['https://buildwithidris.com/'], { endpoint: ok.url });
  assert.equal(r.measured, 1);
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'reports', 'cwv-latest.json'), 'utf8')).pages['https://buildwithidris.com/'];
  assert.deepEqual(m.lab, { performance: 91, lcpMs: 2100, cls: 0.012, tbtMs: 340, fcpMs: 1200 });
  assert.equal(m.field.lcpMs.p75, 1900);
  await ok.close();
  const limited = await mockServer(() => ({ status: 429, body: 'quota' }));
  await assert.rejects(pagespeed.run(['https://buildwithidris.com/'], { endpoint: limited.url }), /quota exhausted/);
  await limited.close();
});

// ---------------- accessibility + LCP ----------------
test('heading order: public homepage markup never skips a level (h2 -> h4)', () => {
  const html = engine().renderPath('/');
  const publicPart = html.split(/<!-- Developer login -->/)[0].replace(/<script[\s\S]*?<\/script>/g, '');
  const levels = [...publicPart.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] <= levels[i - 1] + 1, `h${levels[i - 1]} followed by h${levels[i]} at heading #${i + 1}`);
});

test('LCP: the hero reveal starts right after the hero markup, not at the end of the page', () => {
  const html = fs.readFileSync(path.join(BACKEND, '..', 'index.html'), 'utf8');
  const heroEnd = html.indexOf('</section>', html.indexOf('<section class="hero reveal">'));
  const earlyScript = html.indexOf("querySelector('.hero.reveal')", heroEnd);
  assert.ok(earlyScript > heroEnd && earlyScript - heroEnd < 300, 'inline reveal script directly after the hero section');
});
