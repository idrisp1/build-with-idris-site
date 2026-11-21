// Phase 10A: existing website functionality still works.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, login, BACKEND } from './helpers.mjs';

let srv;
let cookie;
const CONTENT_FILE = path.join(BACKEND, 'data', 'content.json');
let originalContent = null;

before(async () => {
  originalContent = fs.existsSync(CONTENT_FILE) ? fs.readFileSync(CONTENT_FILE, 'utf8') : null;
  srv = await startServer();
  cookie = await login(srv.base);
});
after(async () => {
  await srv.stop();
  if (originalContent !== null) fs.writeFileSync(CONTENT_FILE, originalContent);
});

test('homepage returns 200 and keeps every existing section and nav anchor', async () => {
  const html = await (await fetch(`${srv.base}/`)).text();
  for (const id of ['featured', 'projects', 'ai-systems', 'agency', 'experience', 'education', 'references', 'visitor-reviews', 'contact']) {
    assert.match(html, new RegExp(`<section[^>]*id="${id}"`), `section #${id}`);
  }
  for (const a of ['#projects', '#ai-systems', '#agency', '#experience', '#education', '#references', '#visitor-reviews', '#contact']) {
    assert.ok(html.includes(`<a href="${a}">`), `nav ${a}`);
  }
  // Admin/editing UI still present for the in-place editor
  for (const id of ['devLoginBtn', 'loginModal', 'projectEditModal', 'profileEditModal', 'searchConsoleModal', 'inboxModal', 'floatingVideoEditModal']) {
    assert.ok(html.includes(`id="${id}"`), `admin element #${id}`);
  }
  // Exactly one new nav item
  const nav = html.split('<div class="nav-links">')[1].split('</div>')[0];
  assert.equal((nav.match(/<a /g) || []).length, 9, 'original 8 nav links + Services');
  assert.equal((nav.match(/<a href="\/services">Services<\/a>/g) || []).length, 1);
});

test('existing projects, experience and contact content are present in the initial HTML', async () => {
  const content = await (await fetch(`${srv.base}/api/content`)).json();
  const html = await (await fetch(`${srv.base}/`)).text();
  const projects = JSON.parse(content.data['idris-projects']);
  const experience = JSON.parse(content.data['idris-experience']);
  const contact = JSON.parse(content.data['idris-contact-info']);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;');
  for (const p of projects) assert.ok(html.includes(esc(p.title)), `project ${p.title}`);
  for (const e of experience) assert.ok(html.includes(e.company.replace(/&/g, '&amp;')), `experience ${e.company}`);
  assert.ok(html.includes(contact.email));
});

test('content API keeps all 12 content keys', async () => {
  const content = await (await fetch(`${srv.base}/api/content`)).json();
  assert.deepEqual(Object.keys(content.data).sort(), [
    'idris-agency', 'idris-ai-systems', 'idris-certifications', 'idris-contact-info', 'idris-education', 'idris-experience',
    'idris-floating-video', 'idris-profile', 'idris-projects', 'idris-references', 'idris-section-visibility', 'idris-stats'
  ].sort());
});

test('authentication: bad password rejected, session works, logout works', async () => {
  const bad = await fetch(`${srv.base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x', password: 'y' }) });
  assert.equal(bad.status, 401);
  const s = await (await fetch(`${srv.base}/api/admin/session`, { headers: { cookie } })).json();
  assert.equal(s.authenticated, true);
  const anon = await (await fetch(`${srv.base}/api/admin/session`)).json();
  assert.equal(anon.authenticated, false);
  // logout invalidates a (separate) session
  const second = await login(srv.base);
  await fetch(`${srv.base}/api/admin/logout`, { method: 'POST', headers: { cookie: second } });
  const after = await (await fetch(`${srv.base}/api/admin/session`, { headers: { cookie: second } })).json();
  assert.equal(after.authenticated, false);
});

test('profile editing still saves, and the edit flows into the server-rendered page', async () => {
  const content = await (await fetch(`${srv.base}/api/content`)).json();
  const profile = JSON.parse(content.data['idris-profile']);
  const edited = { ...profile, headline: 'Regression test headline 12345' };
  const put = await fetch(`${srv.base}/api/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ data: { 'idris-profile': JSON.stringify(edited) } }) });
  assert.equal(put.status, 200);
  const html = await (await fetch(`${srv.base}/`)).text();
  assert.ok(html.includes('Regression test headline 12345'));
  // restore
  await fetch(`${srv.base}/api/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ data: { 'idris-profile': JSON.stringify(profile) } }) });
  const unauth = await fetch(`${srv.base}/api/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
  assert.equal(unauth.status, 401);
});

test('contact form still works and records an anonymous attribution', async () => {
  const res = await fetch(`${srv.base}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test Person', email: 'test@example.com', message: 'Regression test message', attribution: { landing: '/services/ai-development', ref: 'chatgpt.com', utm_source: 'chatgpt.com' } }) });
  assert.equal(res.status, 201);
  const conv = fs.readFileSync(path.join(srv.dataDir, 'analytics', 'conversions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const last = conv.at(-1);
  assert.equal(last.source, 'ai:chatgpt');
  assert.equal(last.landing, '/services/ai-development');
  assert.ok(!JSON.stringify(last).includes('test@example.com'), 'no personal data in attribution log');
  const msgs = await (await fetch(`${srv.base}/api/messages`, { headers: { cookie } })).json();
  const mine = msgs.messages.find((m) => m.message === 'Regression test message');
  assert.ok(mine);
});

test('visitor reviews: submit, moderate, delete still work', async () => {
  const r = await fetch(`${srv.base}/api/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tester', text: 'Regression review' }) });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  const approve = await fetch(`${srv.base}/api/reviews/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ status: 'approved' }) });
  assert.equal(approve.status, 200);
  const del = await fetch(`${srv.base}/api/reviews/${id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(del.status, 200);
});

test('static assets, uploads route and the Search Insights endpoint are unchanged', async () => {
  assert.equal((await fetch(`${srv.base}/assets/images/favicon.svg`)).status, 200);
  assert.equal((await fetch(`${srv.base}/assets/screenshots/peggy-hero.webp`)).status, 200);
  const gsc = await fetch(`${srv.base}/api/admin/search-console/status`, { headers: { cookie } });
  assert.equal(gsc.status, 200);
  assert.equal((await fetch(`${srv.base}/api/admin/search-console/status`)).status, 401);
});

test('new SEO admin API is admin-only', async () => {
  assert.equal((await fetch(`${srv.base}/api/admin/seo/status`)).status, 401);
  const res = await fetch(`${srv.base}/api/admin/seo/status`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.publicUrls) && body.publicUrls.includes('/services'));
  assert.ok(!JSON.stringify(body).match(/private_key|apikey=|sk-ant-/i), 'no secrets in status');
});
