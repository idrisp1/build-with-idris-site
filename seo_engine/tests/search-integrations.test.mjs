// Phase 10C: IndexNow, Bing and change detection, against local mock APIs.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mockServer, useDataDir } from './helpers.mjs';

const indexnow = await import('../../backend/seo_engine/integrations/indexnow.js');
const bing = await import('../../backend/seo_engine/integrations/bing.js');
const { redact } = await import('../../backend/seo_engine/integrations/http.js');
const { refreshUrlState } = await import('../../backend/seo_engine/render/discovery.js');
process.env.BING_MIN_INTERVAL_MS = process.env.BING_MIN_INTERVAL_MS ?? '0';

let dir;
beforeEach(() => {
  dir = useDataDir();
  process.env.FRONTEND_ORIGIN = 'https://buildwithidris.com';
  process.env.INDEXNOW_ENABLED = 'true';
});

function readLog() {
  return fs.readFileSync(path.join(dir, 'history', 'indexnow.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

test('IndexNow: key is generated once, persisted, and well-formed', () => {
  const k1 = indexnow.getKey();
  const k2 = indexnow.getKey();
  assert.equal(k1, k2);
  assert.match(k1, /^[a-f0-9]{32}$/);
});

test('IndexNow: correct payload, 200 recorded as "received" (not "indexed"), queue cleared', async () => {
  const mock = await mockServer(() => ({ status: 200, body: '' }));
  process.env.INDEXNOW_ENDPOINT = mock.url;
  indexnow.enqueue(['https://buildwithidris.com/services', 'https://evil.example.com/x']);
  const r = await indexnow.flush({ force: true });
  assert.equal(r.status, 'received');
  const body = JSON.parse(mock.calls[0].body);
  assert.equal(body.host, 'buildwithidris.com');
  assert.equal(body.keyLocation, `https://buildwithidris.com/${indexnow.getKey()}.txt`);
  assert.deepEqual(body.urlList, ['https://buildwithidris.com/services'], 'foreign hosts are never submitted');
  assert.equal(readLog().at(-1).outcome, 'received');
  await mock.close();
});

test('IndexNow: 429 then 5xx are retried with backoff and eventually succeed', async () => {
  const mock = await mockServer((_req, _b, n) => (n === 1 ? { status: 429 } : n === 2 ? { status: 503 } : { status: 202 }));
  process.env.INDEXNOW_ENDPOINT = mock.url;
  indexnow.enqueue(['https://buildwithidris.com/']);
  const r = await indexnow.flush({ force: true });
  assert.equal(mock.calls.length, 3);
  assert.equal(r.status, 'received-key-pending');
  await mock.close();
});

test('IndexNow: 403 is recorded as rejected and not retried', async () => {
  const mock = await mockServer(() => ({ status: 403, body: 'key not valid' }));
  process.env.INDEXNOW_ENDPOINT = mock.url;
  indexnow.enqueue(['https://buildwithidris.com/']);
  const r = await indexnow.flush({ force: true });
  assert.equal(mock.calls.length, 1);
  assert.equal(r.status, 'rejected');
  await mock.close();
});

test('IndexNow: persistent network failure keeps URLs queued for the next run', async () => {
  process.env.INDEXNOW_ENDPOINT = 'http://127.0.0.1:1/unreachable';
  indexnow.enqueue(['https://buildwithidris.com/services']);
  const r = await indexnow.flush({ force: true });
  assert.equal(r.status, 'error');
  assert.deepEqual(indexnow.queue().pending, ['https://buildwithidris.com/services']);
});

test('IndexNow: local rate limit prevents back-to-back submissions', async () => {
  const mock = await mockServer(() => ({ status: 200 }));
  process.env.INDEXNOW_ENDPOINT = mock.url;
  indexnow.enqueue(['https://buildwithidris.com/a']);
  await indexnow.flush({ force: true });
  indexnow.enqueue(['https://buildwithidris.com/b']);
  const r = await indexnow.flush();
  assert.equal(r.status, 'rate-limited-locally');
  assert.equal(mock.calls.length, 1);
  await mock.close();
});

test('change detection: unchanged pages are never resubmitted; changed/added/removed are detected', () => {
  const site = { projects: [], updatedAt: '2026-11-21' };
  let html = { '/': 'A', '/services': 'B' };
  const render = (p) => html[p] ?? `page ${p}`;
  const first = refreshUrlState(site, render);
  assert.ok(first.added.includes('/') && first.added.includes('/services'));
  const second = refreshUrlState(site, render);
  assert.deepEqual([second.added, second.changed, second.removed], [[], [], []], 'no-op second run');
  html = { ...html, '/services': 'B changed' };
  const third = refreshUrlState(site, render);
  assert.deepEqual(third.changed, ['/services']);
  const fourth = refreshUrlState(site, render);
  assert.deepEqual(fourth.changed, []);
  // copyright year changes alone are ignored
  html = { ...html, '/': 'A &copy; 2026' };
  refreshUrlState(site, render);
  html = { ...html, '/': 'A &copy; 2027' };
  assert.deepEqual(refreshUrlState(site, render).changed, []);
});

test('Bing: JSON endpoint, d-unwrapping, date normalization, key sent but never leaked in errors', async () => {
  const mock = await mockServer((req) => {
    if (req.url.startsWith('/GetQueryStats')) return { status: 200, body: { d: [{ __type: 'QueryStats', Query: 'web developer phoenix', Impressions: 40, Clicks: 2, AvgImpressionPosition: 9.5, Date: '/Date(1763683200000)/' }] } };
    return { status: 400, body: 'bad request for apikey=SECRET123' };
  });
  process.env.BING_API_BASE = mock.url;
  process.env.BING_WEBMASTER_API_KEY = 'SECRET123';
  try {
  const rows = await bing.getQueryStats();
  assert.equal(rows[0].Query, 'web developer phoenix');
  assert.equal(rows[0].Date, '2025-11-21T00:00:00.000Z');
  assert.equal(rows[0].__type, undefined);
  assert.match(mock.calls[0].url, /apikey=SECRET123/);
  assert.match(decodeURIComponent(mock.calls[0].url), /siteUrl=https:\/\/buildwithidris.com\//);
  await assert.rejects(bing.getCrawlIssues(), (err) => !err.message.includes('SECRET123'));
  } finally {
    delete process.env.BING_WEBMASTER_API_KEY;
    await mock.close();
  }
});

test('redaction removes API keys from any logged text', () => {
  assert.equal(redact('GET https://x/y?apikey=abc123&siteUrl=z'), 'GET https://x/y?apikey=[redacted]&siteUrl=z');
});

test('Search Console: reports "not configured" instead of pretending', async () => {
  delete process.env.GSC_SERVICE_ACCOUNT_JSON;
  const gsc = await import('../../backend/seo_engine/integrations/gsc.js');
  assert.equal(gsc.isConfigured(), false);
  await assert.rejects(gsc.syncSearchAnalytics(), /GSC_SERVICE_ACCOUNT_JSON/);
});

test('sitemap submission: a refused submission (403) is retried; a successful one is repeated only when pages are added/removed', async () => {
  const { shouldSubmitSitemap } = await import('../../backend/seo_engine/render/discovery.js');
  assert.equal(shouldSubmitSitemap(undefined, null), true, 'never submitted');
  assert.equal(shouldSubmitSitemap({ ok: false, status: 403, at: '2026-11-21T14:25:39Z' }, { at: '2026-11-21T14:00:00Z' }), true, 'refused -> retry (the production bug)');
  assert.equal(shouldSubmitSitemap({ ok: true, at: '2026-11-22T10:00:00Z' }, { at: '2026-11-21T14:00:00Z' }), false, 'already accepted, nothing new');
  assert.equal(shouldSubmitSitemap({ ok: true, at: '2026-11-22T10:00:00Z' }, { at: '2026-11-23T09:00:00Z' }), true, 'new pages since -> resubmit');
});

test('Bing throttling: calls are spaced out and a ThrottleHost reply is retried, not recorded as a failure', async () => {
  let n = 0;
  const times = [];
  const mock = await mockServer((req) => {
    times.push(Date.now());
    n += 1;
    if (n === 1) return { status: 400, body: '{"ErrorCode":5,"Message":"ERROR!!! ThrottleHost"}' };
    return { body: { d: { DailyQuota: 100, MonthlyQuota: 900 } } };
  });
  process.env.BING_API_BASE = mock.url; process.env.BING_WEBMASTER_API_KEY = 'K1234567';
  process.env.BING_MIN_INTERVAL_MS = '150'; process.env.BING_THROTTLE_BACKOFF_MS = '50';
  try {
    const q = await bing.getUrlSubmissionQuota();
    assert.equal(q.DailyQuota, 100, 'succeeded after the throttle retry');
    await bing.getUrlSubmissionQuota();
    assert.equal(mock.calls.length, 3);
    assert.ok(times[2] - times[1] >= 140, `calls spaced out (${times[2] - times[1]}ms)`);
  } finally {
    delete process.env.BING_WEBMASTER_API_KEY; delete process.env.BING_MIN_INTERVAL_MS; delete process.env.BING_THROTTLE_BACKOFF_MS;
    await mock.close();
  }
});
