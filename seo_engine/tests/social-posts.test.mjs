// Phase 10F: the 200-post social media plan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer } from './helpers.mjs';

const FILE = path.join(ROOT, 'social media posting', 'social_media_post_ideas.md');
const text = fs.readFileSync(FILE, 'utf8');
const posts = text.split(/\n(?=## Day \d{3} — )/).slice(1);
let srv;
before(async () => { srv = await startServer(); });
after(() => srv.stop());

test('exactly 200 numbered headings, Day 001 to Day 200 in order', () => {
  const headings = [...text.matchAll(/^## Day (\d{3}) — (.+)$/gm)];
  assert.equal(headings.length, 200);
  headings.forEach((m, i) => assert.equal(Number(m[1]), i + 1));
  assert.match(headings[0][2], /Website Development for Phoenix/);
});

test('every post is complete: all required fields and a non-empty caption', () => {
  assert.equal(posts.length, 200);
  for (const p of posts) {
    for (const field of ['Platform', 'Topic', 'Target audience', 'Search / discovery intent', 'Service or capability promoted', 'Website link', 'Call to action', 'Hashtags', 'Suggested creative']) {
      assert.match(p, new RegExp(`- \\*\\*${field.replace(/[/]/g, '\\/')}:\\*\\* \\S`), `${p.slice(0, 40)} missing ${field}`);
    }
    const caption = p.split('**Caption (ready to publish):**')[1];
    assert.ok(caption && caption.replace(/[>\s-]/g, '').length > 80, `${p.slice(0, 40)} caption too short`);
  }
});

test('posts are genuinely different: unique topics and captions, no near-duplicates', () => {
  const topics = posts.map((p) => p.match(/^## Day \d{3} — (.+)$/m)[1]);
  assert.equal(new Set(topics).size, 200);
  const bodies = posts.map((p) => p.split('**Caption (ready to publish):**')[1].replace(/https?:\/\/\S+|#\w+/g, '').toLowerCase());
  const shingles = (s) => { const t = s.split(/\W+/).filter(Boolean); const out = new Set(); for (let i = 0; i + 5 <= t.length; i += 1) out.add(t.slice(i, i + 5).join(' ')); return out; };
  const sets = bodies.map(shingles);
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      let inter = 0; for (const s of sets[i]) if (sets[j].has(s)) inter += 1;
      const ratio = inter / Math.max(1, Math.min(sets[i].size, sets[j].size));
      assert.ok(ratio < 0.5, `Day ${i + 1} and Day ${j + 1} are near-duplicates (${ratio.toFixed(2)})`);
    }
  }
});

test('only the platforms the owner has are used', () => {
  for (const p of posts) assert.match(p.match(/\*\*Platform:\*\* (.+)/)[1], /^(Facebook|LinkedIn|Instagram|TikTok|YouTube|Reddit)/);
});

test('every website link is on buildwithidris.com, UTM-tagged, and resolves to a real page', async () => {
  const urls = new Set(posts.map((p) => p.match(/\*\*Website link:\*\* (\S+)/)[1]));
  for (const u of urls) {
    const url = new URL(u);
    assert.equal(url.host, 'buildwithidris.com');
    assert.equal(url.searchParams.get('utm_medium'), 'social');
    assert.match(url.searchParams.get('utm_campaign'), /^post-\d{3}$/);
    const res = await fetch(`${srv.base}${url.pathname}`);
    assert.equal(res.status, 200, `${url.pathname} does not exist`);
  }
});

test('hashtags present (except Reddit) and relevant in count', () => {
  for (const p of posts) {
    const tags = p.match(/\*\*Hashtags:\*\* (.+)/)[1];
    if (/\*\*Platform:\*\* Reddit/.test(p)) { assert.match(tags, /^None/); continue; }
    const n = (tags.match(/#\w+/g) || []).length;
    assert.ok(n >= 2 && n <= 6, `${n} hashtags`);
  }
});

test('no invented claims: no prices, guarantees, superlatives or unverified figures', async () => {
  // Every figure must come from the site's own evidence (same source as the content quality gate)...
  const { getContent } = await import('../../backend/lib/contentStore.js');
  const { loadSite, evidenceCorpus, numbersIn } = await import('../../backend/seo_engine/evidence.js');
  const allowedNumbers = numbersIn(evidenceCorpus(loadSite(getContent)));
  // ...except small counts used in lists ("5 tasks", "3 steps") and technical names
  // that aren't claims: OAuth 2.0, HTTP 404, the sitemap/word-count figures that
  // describe this site's own measured prerender change (~300 -> ~2,000 words).
  for (const n of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '20', '30', '60', '001', '2.0', '404', '300', '2000', '500K', '50K']) allowedNumbers.add(n);
  for (const p of posts) {
    const caption = p.split('**Caption (ready to publish):**')[1].replace(/https?:\/\/\S+/g, '');
    assert.doesNotMatch(caption, /\$\s?\d/, 'price');
    // Disclaimers ("doesn't guarantee", "if someone guarantees ..., walk away") are allowed; promises are not.
    const promises = caption.replace(/If someone guarantees[^.]*walk away\.|doesn't guarantee|can't guarantee|no one can guarantee/gi, '');
    assert.doesNotMatch(promises, /\bguarantee(d|s)?\b/i, `guarantee in: ${p.slice(0, 60)}`);
    assert.doesNotMatch(caption, /\b(#1|number one|best in (town|phoenix|arizona)|award-winning|top-rated)\b/i, 'superlative');
    for (const m of caption.matchAll(/\d[\d,]*(?:\.\d+)?(K)?/g)) {
      const n = m[0].replace(/,/g, '');
      assert.ok(allowedNumbers.has(n), `unverified figure "${m[0]}" in: ${p.slice(0, 60)}`);
    }
  }
});
