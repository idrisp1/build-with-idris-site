// Phase 10B + 10E: SEO correctness and landing-page quality.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.mjs';
import { parseHtml, audit } from '../../backend/seo_engine/agents/technicalAuditor.js';
import { SERVICES } from '../../backend/seo_engine/catalog.js';
import { jaccard } from '../../backend/seo_engine/agents/qualityGate.js';

let srv;
let paths;
before(async () => {
  srv = await startServer();
  // In-process modules (auditor, key file) must see the same origin + data dir.
  process.env.FRONTEND_ORIGIN = srv.base;
  process.env.SEO_DATA_DIR = srv.dataDir;
  const xml = await (await fetch(`${srv.base}/sitemap.xml`)).text();
  paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(srv.base, '') || '/');
});
after(() => srv.stop());

test('sitemap is valid, lists every public page with lastmod, and nothing else', async () => {
  const xml = await (await fetch(`${srv.base}/sitemap.xml`)).text();
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.equal((xml.match(/<url>/g) || []).length, (xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length);
  for (const p of ['/', '/services', ...SERVICES.map((s) => `/services/${s.slug}`)]) assert.ok(paths.includes(p), `sitemap has ${p}`);
  assert.ok(!paths.includes('/insights'), 'empty insights index is not published');
});

test('every sitemap URL: 200, one h1, self-canonical, title + description, indexable, valid JSON-LD graph', async () => {
  for (const p of paths) {
    const res = await fetch(srv.base + p);
    assert.equal(res.status, 200, p);
    const parsed = parseHtml(await res.text());
    assert.equal(parsed.h1s.length, 1, `${p} h1 count`);
    assert.equal(parsed.canonical, srv.base + p, `${p} canonical`);
    assert.ok(parsed.title.length >= 20 && parsed.title.length <= 90, `${p} title "${parsed.title}"`);
    assert.ok(parsed.description && parsed.description.length >= 50 && parsed.description.length <= 170, `${p} description length ${parsed.description?.length}`);
    assert.doesNotMatch(parsed.robots || '', /noindex/, `${p} must be indexable`);
    assert.equal(parsed.jsonLd.length, 1, `${p} exactly one JSON-LD block`);
    const ld = JSON.parse(parsed.jsonLd[0]);
    assert.ok(Array.isArray(ld['@graph']));
    const types = ld['@graph'].map((n) => n['@type']);
    assert.ok(types.includes('Person') && types.includes('WebSite'), `${p} has Person + WebSite`);
    const text = JSON.stringify(ld);
    assert.doesNotMatch(text, /AggregateRating|"Review"|"price"/, `${p} has no ratings/reviews/prices`);
    if (p !== '/') assert.ok(types.includes('BreadcrumbList'), `${p} breadcrumbs`);
  }
});

test('titles and descriptions are unique across pages', async () => {
  const titles = new Set(); const descs = new Set();
  for (const p of paths) {
    const parsed = parseHtml(await (await fetch(srv.base + p)).text());
    assert.ok(!titles.has(parsed.title), `duplicate title ${parsed.title}`);
    assert.ok(!descs.has(parsed.description), `duplicate description on ${p}`);
    titles.add(parsed.title); descs.add(parsed.description);
  }
});

test('robots.txt allows search/AI-search crawlers, blocks training crawlers, declares sitemap', async () => {
  const txt = await (await fetch(`${srv.base}/robots.txt`)).text();
  assert.match(txt, /User-agent: \*\nAllow: \/\nDisallow: \/api\//);
  for (const bot of ['OAI-SearchBot', 'PerplexityBot', 'Bingbot', 'Googlebot', 'Claude-SearchBot']) assert.match(txt, new RegExp(`User-agent: ${bot}\\nAllow: /`));
  for (const bot of ['GPTBot', 'Google-Extended', 'CCBot', 'ClaudeBot']) assert.match(txt, new RegExp(`User-agent: ${bot}\\nDisallow: /\\n`));
  assert.match(txt, new RegExp(`Sitemap: ${srv.base}/sitemap.xml`));
});

test('duplicate URLs redirect; unknown URLs return a real 404', async () => {
  const r = await fetch(`${srv.base}/index.html`, { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/');
  const nf = await fetch(`${srv.base}/does-not-exist`);
  assert.equal(nf.status, 404);
  assert.match(await nf.text(), /noindex/);
  assert.equal((await fetch(`${srv.base}/services/not-a-service`)).status, 404);
});

test('www host 301-redirects to the apex in production mode', async () => {
  const prod = await startServer({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'http://localtest.me', INDEXNOW_ENABLED: 'false' });
  try {
    // Node's fetch won't send a custom Host header, so use http.get directly.
    const http = await import('node:http');
    const r = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: prod.port, path: '/services?x=1', headers: { host: 'www.localtest.me' } }, (res) => { res.resume(); resolve(res); }).on('error', reject);
    });
    assert.equal(r.statusCode, 301);
    assert.equal(r.headers.location, 'http://localtest.me/services?x=1');
    const apex = await fetch(`${prod.base}/health`, { headers: { host: 'localtest.me' } });
    assert.equal(apex.status, 200);
  } finally { await prod.stop(); }
});

test('homepage initial HTML contains the real content without JavaScript (>= 1500 words)', async () => {
  const parsed = parseHtml(await (await fetch(`${srv.base}/`)).text());
  assert.ok(parsed.words >= 1500, `only ${parsed.words} words`);
  assert.doesNotMatch(parsed.title, /__/, 'no unreplaced placeholders');
  const raw = await (await fetch(`${srv.base}/`)).text();
  assert.doesNotMatch(raw, /__(PAGE_TITLE|META_DESC|SITE_NAME|HEAD_EXTRA|JSON_LD|OG_[A-Z]+)__/);
  assert.match(raw, /<div class="admin-bar" data-nosnippet>/, 'admin UI excluded from snippets');
});

test('llms.txt and IndexNow key file are served', async () => {
  const llms = await (await fetch(`${srv.base}/llms.txt`)).text();
  assert.match(llms, /^# /);
  assert.match(llms, /\/services\/ai-development/);
  const { getKey } = await import('../../backend/seo_engine/integrations/indexnow.js');
  const key = getKey();
  const r = await fetch(`${srv.base}/${key}.txt`);
  assert.equal(r.status, 200);
  assert.equal((await r.text()).trim(), key);
  assert.equal((await fetch(`${srv.base}/0000000000000000wrongkey.txt`)).status, 404);
});

test('technical auditor finds zero errors on the live local server', async () => {
  const r = await audit({ baseUrl: srv.base, paths });
  const errors = r.issues.filter((i) => i.severity === 'error');
  assert.deepEqual(errors, [], JSON.stringify(errors, null, 1));
});

test('landing pages: verified services only, distinct intents, no near-duplicate targets', () => {
  assert.equal(SERVICES.length, 7);
  for (const s of SERVICES) assert.ok(s.agencyTitle || s.engineering, `${s.slug} must be an agency category or engineering service`);
  for (let i = 0; i < SERVICES.length; i += 1) {
    for (let j = i + 1; j < SERVICES.length; j += 1) {
      const a = SERVICES[i]; const b = SERVICES[j];
      assert.ok(jaccard(a.primaryKeyword, b.primaryKeyword) < 0.6, `${a.slug} vs ${b.slug} primary keywords overlap`);
      assert.ok(jaccard(a.title, b.title) < 0.6, `${a.slug} vs ${b.slug} titles overlap`);
    }
  }
});

test('service page copy makes no unsupported claims (prices, guarantees, superlatives)', async () => {
  for (const s of SERVICES) {
    const html = await (await fetch(`${srv.base}/services/${s.slug}`)).text();
    const body = html.split('<main')[1].replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(body, /\$\s?\d/, `${s.slug} price`);
    assert.doesNotMatch(body.replace(/Can you guarantee first-page rankings\?|No, and you should be wary of anyone who does/g, ''), /\bguarantee/i, `${s.slug} guarantee`);
    assert.doesNotMatch(body, /#1|number one|best in|award-winning|top-rated/i, `${s.slug} superlative`);
  }
});
