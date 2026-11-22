// "Contact Our Business" section: additive, four working buttons, existing
// site untouched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, login, BACKEND } from './helpers.mjs';

let srv;
let cookie;
const CONTENT_FILE = path.join(BACKEND, 'data', 'content.json');
let original = null;
before(async () => {
  original = fs.existsSync(CONTENT_FILE) ? fs.readFileSync(CONTENT_FILE, 'utf8') : null;
  srv = await startServer();
  cookie = await login(srv.base);
});
after(async () => {
  await srv.stop();
  if (original !== null) fs.writeFileSync(CONTENT_FILE, original);
});

const section = (html) => html.split('<section class="section reveal" id="contact-business">')[1].split('</section>')[0];

test('the new section exists once, directly before the existing contact section and after reviews', async () => {
  const html = await (await fetch(`${srv.base}/`)).text();
  assert.equal(html.split('id="contact-business"').length - 1, 1);
  const order = ['id="visitor-reviews"', 'id="contact-business"', 'id="contact"'].map((m) => html.indexOf(m));
  assert.ok(order[0] < order[1] && order[1] < order[2], `order ${order}`);
  assert.match(section(html), /<h2>Contact Our Business<\/h2>/);
});

test('exactly four buttons with the required links; email comes from the existing contact info', async () => {
  const html = await (await fetch(`${srv.base}/`)).text();
  const content = await (await fetch(`${srv.base}/api/content`)).json();
  const email = JSON.parse(content.data['idris-contact-info']).email;
  const links = [...section(html).matchAll(/<a class="cob-btn[^"]*"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(links, [
    ['Message us on iMessage', 'sms:+14805627514'],
    ['WhatsApp us', 'https://wa.me/14805627514'],
    ['Email us', `mailto:${email}`],
    ['Contact us', '#contact']
  ]);
  assert.match(section(html), /href="https:\/\/wa\.me\/14805627514" target="_blank" rel="noopener"/);
});

test('no Facebook Messenger, Instagram or Telegram anywhere in the section', async () => {
  const s = section(await (await fetch(`${srv.base}/`)).text());
  assert.doesNotMatch(s, /messenger|m\.me\/|instagram|telegram|t\.me\//i);
});

test('"Contact us" points at the existing contact form, which still exists and still works', async () => {
  const html = await (await fetch(`${srv.base}/`)).text();
  assert.match(html, /<section class="section reveal" id="contact">[\s\S]*<form id="contactForm">/);
  const r = await fetch(`${srv.base}/api/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Cob Test', email: 'cob@example.com', message: 'contact form still works' }) });
  assert.equal(r.status, 201);
});

test('editing the business email in admin updates the Email button', async () => {
  const content = await (await fetch(`${srv.base}/api/content`)).json();
  const info = JSON.parse(content.data['idris-contact-info']);
  const put = (v) => fetch(`${srv.base}/api/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ data: { 'idris-contact-info': JSON.stringify(v) } }) });
  await put({ ...info, email: 'changed@example.com' });
  assert.match(section(await (await fetch(`${srv.base}/`)).text()), /href="mailto:changed@example\.com"/);
  await put(info);
  assert.match(section(await (await fetch(`${srv.base}/`)).text()), new RegExp(`href="mailto:${info.email.replace('.', '\\.')}"`));
});

test('purely additive: every pre-existing section and nav link is unchanged', async () => {
  const html = await (await fetch(`${srv.base}/`)).text();
  for (const id of ['featured', 'projects', 'ai-systems', 'agency', 'experience', 'education', 'references', 'visitor-reviews', 'contact']) {
    assert.match(html, new RegExp(`<section[^>]*id="${id}"`), id);
  }
  const nav = html.split('<div class="nav-links">')[1].split('</div>')[0];
  assert.equal((nav.match(/<a /g) || []).length, 9, 'no new nav link');
  assert.doesNotMatch(nav, /contact-business/);
});
