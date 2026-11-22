// Article pack (owner-approved articles shipped in the repo) and the
// competitor gap agent's topic cleaning, robots handling and de-duplication.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, login, tempDir } from './helpers.mjs';

const para = (topic, i) => `When a small business looks at ${topic}, the first step is to write down each manual task in the order it happens today, who does it, and what information moves between tools. Part ${i} is about deciding which piece is predictable enough to hand to software, and which piece still needs a person to look at it before anything is sent to a customer. Doing this on paper first keeps the process honest and shows where mistakes would come from.`;

const good = {
  slug: 'pack-test-reminders',
  title: 'Planning Reminder Workflows for a Busy Front Desk',
  metaDescription: 'A practical guide for small businesses on planning reminder workflows that save staff time without losing the personal touch customers expect.',
  primaryKeyword: 'reminder workflow planning',
  serviceSlug: 'ai-automation',
  summary: 'What to automate first, what to keep personal, and how to test it before you rely on it.',
  sections: [
    { heading: 'Start with the workflow you already have', body: `${para('reminders', 1)}\n\n${para('follow-ups', 2)}` },
    { heading: 'Pick the trigger', body: `${para('triggers', 3)}\n\n- A new booking\n- A changed appointment` },
    { heading: 'Keep a person in the loop', body: `${para('reviews', 4)}\n\nSee the [automation service](/services/ai-automation).` },
    { heading: 'Test before you rely on it', body: `${para('testing', 5)}\n\n${para('monitoring', 6)}` },
    { heading: 'Review it every month', body: `${para('monthly reviews', 7)}\n\n${para('exceptions', 8)}\n\n${para('customer feedback', 9)}` }
  ],
  faqs: [{ q: 'Will reminders replace my front desk?', a: 'No. They remove the repetitive sending; people still handle conversations.' }],
  relatedProjects: ['cadens']
};
const bad = { ...good, slug: 'pack-test-priced', title: 'Reminder Workflows Priced for Small Teams Today', primaryKeyword: 'priced reminder workflows', summary: 'Plans start at $99 a month.' };

let srv;
let packFile;
let dataDir;
before(async () => {
  const dir = tempDir('pack-');
  packFile = path.join(dir, 'pack.json');
  fs.writeFileSync(packFile, JSON.stringify({ name: 'test pack', articles: [good, bad] }));
  dataDir = tempDir();
  srv = await startServer({ SEO_ARTICLE_PACK: packFile, SEO_DATA_DIR: dataDir });
});
after(() => srv?.stop());

test('pack: passing article is published at startup', async () => {
  const r = await fetch(`${srv.base}/insights/pack-test-reminders`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Planning Reminder Workflows/);
});

test('pack: article failing the quality gate is not published', async () => {
  assert.equal((await fetch(`${srv.base}/insights/pack-test-priced`)).status, 404);
  const cookie = await login(srv.base);
  const rep = await (await fetch(`${srv.base}/api/admin/seo/reports/article-pack`, { headers: { cookie } })).json();
  const row = JSON.stringify(rep);
  assert.match(row, /pack-test-priced/);
  assert.match(row, /unsupported-claim/);
});

test('pack: a restart never duplicates or overwrites existing articles', async () => {
  await srv.stop();
  srv = await startServer({ SEO_ARTICLE_PACK: packFile, SEO_DATA_DIR: dataDir });
  const cookie = await login(srv.base);
  const rep = await (await fetch(`${srv.base}/api/admin/seo/reports/article-pack`, { headers: { cookie } })).json();
  const mine = (rep.report || rep).results.find((r) => r.slug === 'pack-test-reminders');
  assert.match(mine.status, /already exists/);
});

test('pack: a higher revision updates the live article through the gate', async () => {
  await srv.stop();
  fs.writeFileSync(packFile, JSON.stringify({ name: 'test pack', articles: [{ ...good, revision: 2, title: 'Planning Reminder Workflows for a Busy Reception Desk' }, bad] }));
  srv = await startServer({ SEO_ARTICLE_PACK: packFile, SEO_DATA_DIR: dataDir });
  assert.match(await (await fetch(`${srv.base}/insights/pack-test-reminders`)).text(), /Busy Reception Desk/);
  await srv.stop();
  srv = await startServer({ SEO_ARTICLE_PACK: packFile, SEO_DATA_DIR: dataDir });
  const cookie = await login(srv.base);
  const rep = await (await fetch(`${srv.base}/api/admin/seo/reports/article-pack`, { headers: { cookie } })).json();
  assert.match((rep.report || rep).results.find((r) => r.slug === 'pack-test-reminders').status, /already exists/, 'same revision is not re-applied');
});

test('competitors: list saved from the admin panel is validated and used', async () => {
  const cookie = await login(srv.base);
  const post = await fetch(`${srv.base}/api/admin/seo/competitors`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ urls: ['example.com', 'https://www.rival.example/blog', 'not a url', 'http://127.0.0.1', 'example.com'].join('\n') }) });
  const body = await post.json();
  assert.deepEqual(body.urls, ['https://example.com', 'https://www.rival.example']);
  const get = await (await fetch(`${srv.base}/api/admin/seo/competitors`, { headers: { cookie } })).json();
  assert.equal(get.source, 'admin panel');
  assert.equal((await fetch(`${srv.base}/api/admin/seo/competitors`)).status, 401);
});

test('competitors: topic cleaning, blocked sites, sitemap index and de-duplication', async () => {
  process.env.SEO_DATA_DIR = tempDir();
  process.env.SEO_COMPETITOR_URLS = 'https://comp.example,https://blocked.example';
  const comp = await import('../../backend/seo_engine/agents/competitorAnalysis.js');
  assert.equal(comp.topicFromUrl('https://x.com/blog/invoice-ocr-guide-202611201513/', 'x'), 'invoice ocr guide');
  assert.equal(comp.topicFromUrl('https://acme.com/blog/website-redesign-acme-blog/', 'acme'), 'website redesign');
  const pages = {
    'https://comp.example/robots.txt': [200, 'User-agent: *\nDisallow: /private/\nSitemap: https://comp.example/sitemap_index.xml'],
    'https://comp.example/sitemap_index.xml': [200, '<sitemapindex><sitemap><loc>https://comp.example/post-sitemap.xml</loc></sitemap></sitemapindex>'],
    'https://comp.example/post-sitemap.xml': [200, '<urlset>' + ['website-redesign-checklist', 'de/website-redesign-checklist', 'private/website-redesign-secrets', 'contact'].map((p) => `<url><loc>https://comp.example/${p}/</loc></url>`).join('') + '</urlset>'],
    'https://blocked.example/robots.txt': [403, 'Just a moment...']
  };
  const fetchImpl = async (u) => { const [status, body] = pages[u] || [404, '']; return { status, text: async () => body }; };
  const r = await comp.run({ fetchImpl });
  const topics = r.gaps.map((g) => g.topic);
  assert.equal(topics.filter((t) => t === 'website redesign checklist').length, 1, 'language copies merged');
  assert.ok(!topics.some((t) => t.includes('secrets')), 'robots-disallowed URL ignored');
  assert.ok(!topics.includes('contact'), 'one-word pages ignored');
  assert.match(r.competitors.find((c) => c.site === 'https://blocked.example').skipped, /blocks automated access/);
});

test('competitors: topics we already cover and other-city pages are not gaps', async () => {
  const comp = await import('../../backend/seo_engine/agents/competitorAnalysis.js');
  assert.ok(comp.coveredBy('technical seo', ['Technical SEO Checklist for Small Business Websites']), 'covered by an article title');
  assert.ok(comp.coveredBy('local seo', ['local SEO Phoenix']), 'covered by a service keyword');
  assert.equal(comp.coveredBy('voice search seo', ['local SEO Phoenix', 'technical seo checklist']), null, 'new topic stays a gap');
  process.env.SEO_COMPETITOR_URLS = 'https://comp.example';
  const pages = {
    'https://comp.example/robots.txt': [200, 'Sitemap: https://comp.example/sitemap.xml'],
    'https://comp.example/sitemap.xml': [200, '<urlset>' + ['technical-seo-guide', 'dallas-local-seo', 'voice-search-seo'].map((p) => `<url><loc>https://comp.example/${p}/</loc></url>`).join('') + '</urlset>']
  };
  const fetchImpl = async (u) => { const [status, body] = pages[u] || [404, '']; return { status, text: async () => body }; };
  const r = await comp.run({ fetchImpl, coveredPhrases: ['technical seo checklist'] });
  const topics = r.gaps.map((g) => g.topic);
  assert.ok(!topics.includes('technical seo guide') && r.alreadyCovered >= 1, 'already covered topic hidden');
  assert.ok(!topics.includes('dallas local seo') && r.otherPlaces >= 1, 'other-city page hidden');
  assert.ok(topics.includes('voice search seo'), 'real gap kept');
});
