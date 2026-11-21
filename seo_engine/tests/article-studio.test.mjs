// Owner-written articles, end to end against the real server: check -> draft
// -> publish -> live page + sitemap + insights index + service-page link ->
// edit -> blocking rules -> brief linking.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, login } from './helpers.mjs';

let srv;
let cookie;
before(async () => {
  srv = await startServer();
  cookie = await login(srv.base);
  // a research brief the article will be written from
  fs.mkdirSync(path.join(srv.dataDir, 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(srv.dataDir, 'briefs', 'automate-appointment-reminders.json'), JSON.stringify({ id: 'automate-appointment-reminders', keyword: 'automate appointment reminders', targetService: 'ai-automation', suggestedTitle: 'Automate Appointment Reminders', suggestedOutline: ['The short answer'], evidenceToUse: [], relatedProjects: ['cadens'], recommendation: 'x', createdAt: new Date().toISOString() }));
});
after(() => srv.stop());

const para = (topic, i) => `When a small business looks at ${topic}, the first step is to write down each manual task in the order it happens today, who does it, and what information moves between tools. Part ${i} is about deciding which piece is predictable enough to hand to software, and which piece still needs a person to look at it before anything is sent to a customer. Doing this on paper first keeps the process honest and shows where mistakes would come from.`;

function article(overrides = {}) {
  return {
    title: 'How to Automate Appointment Reminders the Right Way',
    metaDescription: 'A practical, step-by-step guide for small businesses on automating appointment reminders without losing the personal touch customers expect.',
    primaryKeyword: 'automate appointment reminders',
    serviceSlug: 'ai-automation',
    summary: 'What to automate first, what to keep personal, and how to test it before you rely on it.',
    sections: [
      { heading: 'Start with the workflow you already have', body: `${para('reminders', 1)}\n\n${para('follow-ups', 2)}` },
      { heading: 'Pick the trigger', body: `${para('triggers', 3)}\n\n- A new booking\n- A changed appointment` },
      { heading: 'Keep a person in the loop', body: `${para('reviews', 4)}\n\nI built SMS and email workflows like this; see the [automation service](/services/ai-automation).` },
      { heading: 'Test before you rely on it', body: `${para('testing', 5)}\n\n${para('monitoring', 6)}` },
      { heading: 'Review it every month', body: `${para('monthly reviews', 7)}\n\n${para('exceptions', 8)}\n\n${para('customer feedback', 9)}` }
    ],
    faqs: [{ q: 'Will reminders replace my front desk?', a: 'No. They remove the repetitive sending; people still handle conversations.' }],
    relatedProjects: ['cadens'],
    ...overrides
  };
}

async function post(p, body) {
  const r = await fetch(`${srv.base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

test('article endpoints are admin-only', async () => {
  const r = await fetch(`${srv.base}/api/admin/seo/articles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ article: article(), publish: true }) });
  assert.equal(r.status, 401);
});

test('check passes a good owner article (no AI fact-check needed) and reports the URL it will get', async () => {
  const { body } = await post('/api/admin/seo/articles/check', { article: article() });
  assert.equal(body.gate.passed, true, JSON.stringify(body.gate.failures));
  assert.equal(body.slug, 'how-to-automate-appointment-reminders-the-right-way');
  assert.ok(body.gate.words >= 450);
});

test('prices and guarantees always block publishing, and nothing goes live', async () => {
  const bad = article({ title: 'Guaranteed Reminder Setup For Every Small Business', primaryKeyword: 'reminder setup service', sections: article().sections.concat([{ heading: 'Pricing', body: 'Setup is $199 and I guarantee fewer no-shows.' }]) });
  const { body } = await post('/api/admin/seo/articles', { article: bad, publish: true });
  assert.equal(body.published, false);
  assert.equal(body.status, 'draft', 'kept as a draft so the writing is not lost');
  const checks = body.gate.failures.map((f) => f.detail).join(' | ');
  assert.match(checks, /price/);
  assert.match(checks, /guarantee/);
  assert.equal((await fetch(`${srv.base}/insights/${body.slug}`)).status, 404, 'drafts are not public');
});

test('figures not on the site need explicit confirmation', async () => {
  const withFigure = article({ title: 'Reminder Automation Lessons From Real Clinics', primaryKeyword: 'reminder automation lessons', sections: article().sections.concat([{ heading: 'What changed', body: 'After launch, no-shows dropped by 27% at one clinic.' }]) });
  let r = await post('/api/admin/seo/articles/check', { article: withFigure });
  assert.equal(r.body.gate.passed, false);
  assert.ok(r.body.gate.failures.some((f) => f.check === 'confirm-figures' && f.detail.includes('27%')));
  r = await post('/api/admin/seo/articles/check', { article: withFigure, figuresConfirmed: true });
  assert.equal(r.body.gate.passed, true, JSON.stringify(r.body.gate.failures));
});

test('publish: live page with Article schema, on the insights index, the service page, the sitemap and llms.txt; brief marked written', async () => {
  const { body } = await post('/api/admin/seo/articles', { article: article(), publish: true, briefId: 'automate-appointment-reminders' });
  assert.equal(body.published, true, JSON.stringify(body.gate));
  const url = `/insights/${body.slug}`;
  const page = await (await fetch(srv.base + url)).text();
  assert.match(page, /<h1>How to Automate Appointment Reminders the Right Way<\/h1>/);
  assert.match(page, /"@type":"Article"/);
  assert.match(page, /<a href="\/services\/ai-automation">automation service<\/a>/, 'inline link rendered');
  assert.match(page, /<li>A new booking<\/li>/, 'bullets rendered');
  assert.equal((await fetch(`${srv.base}/insights`)).status, 200, 'insights index appears once an article exists');
  assert.ok((await (await fetch(`${srv.base}/services/ai-automation`)).text()).includes(`href="${url}"`), 'service page links to it');
  assert.ok((await (await fetch(`${srv.base}/sitemap.xml`)).text()).includes(`${srv.base}${url}</loc>`));
  assert.ok((await (await fetch(`${srv.base}/llms.txt`)).text()).includes(url));
  const brief = JSON.parse(fs.readFileSync(path.join(srv.dataDir, 'briefs', 'automate-appointment-reminders.json'), 'utf8'));
  assert.equal(brief.articleStatus, 'published');
});

test('editing a live article: title change keeps the same URL, failing edits never touch the live page, versions are kept', async () => {
  const slug = 'how-to-automate-appointment-reminders-the-right-way';
  const loaded = await (await fetch(`${srv.base}/api/admin/seo/articles/${slug}`, { headers: { cookie } })).json();
  assert.equal(loaded.status, 'published');
  const edited = { ...loaded.article, title: 'Automating Appointment Reminders: A Practical Guide', slug, editing: true };
  let r = await post('/api/admin/seo/articles', { article: edited, publish: true });
  assert.equal(r.body.published, true, JSON.stringify(r.body.gate));
  assert.equal(r.body.slug, slug, 'same URL after a title change');
  assert.match(await (await fetch(`${srv.base}/insights/${slug}`)).text(), /<title>Automating Appointment Reminders: A Practical Guide<\/title>/);
  // a failing edit leaves the live article untouched
  r = await post('/api/admin/seo/articles', { article: { ...edited, metaDescription: 'Best in Phoenix, $49 setup.' }, publish: true });
  assert.equal(r.body.status, 'published (unchanged)');
  assert.match(await (await fetch(`${srv.base}/insights/${slug}`)).text(), /A Practical Guide/);
  // "save draft" over a live article is refused (it would change the live page)
  r = await post('/api/admin/seo/articles', { article: edited, publish: false });
  assert.equal(r.status, 409);
  const versions = JSON.parse(fs.readFileSync(path.join(srv.dataDir, 'pages', `article_${slug}.json`), 'utf8')).versions;
  assert.equal(versions.length, 2, 'publish + update, each a version (rollback-able)');
});

test('a new article that repeats an existing article\'s topic is blocked as cannibalization', async () => {
  const dup = article({ title: 'Automate Appointment Reminders for Your Business', metaDescription: 'Another guide to automating appointment reminders for small businesses, covering triggers, testing and keeping people in the loop.' });
  const { body } = await post('/api/admin/seo/articles/check', { article: dup });
  assert.equal(body.gate.passed, false);
  assert.ok(body.gate.failures.some((f) => f.check === 'cannibalization' || f.check === 'duplication'), JSON.stringify(body.gate.failures));
});
