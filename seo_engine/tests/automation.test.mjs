// Phase 10D: scheduler persistence, failure recovery, duplicate prevention,
// versioning and rollback.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useDataDir, startServer, login } from './helpers.mjs';

const { Scheduler } = await import('../../backend/seo_engine/scheduler.js');
const store = await import('../../backend/seo_engine/store.js');
const pages = await import('../../backend/seo_engine/pages.js');
const learning = await import('../../backend/seo_engine/learning.js');

let dir;
beforeEach(() => { dir = useDataDir(); });
const quiet = { log() {}, error() {} };

test('jobs run when due, persist state, and are not re-run before their interval', async () => {
  let runs = 0;
  const s = new Scheduler({ jobs: [{ name: 'a', intervalMs: 3600_000, run: async () => { runs += 1; return { ok: true }; } }], logger: quiet });
  await s.tick();
  assert.equal(runs, 1);
  await s.tick();
  assert.equal(runs, 1, 'not due again yet');
  const state = store.readJson('jobs/state.json', {});
  assert.equal(state.a.lastStatus, 'ok');
  assert.ok(Date.parse(state.a.nextRunAt) > Date.now() + 3500_000);
  const runsLog = store.readJsonl('jobs/runs.jsonl');
  assert.equal(runsLog.length, 1);
});

test('state survives a restart: a new scheduler instance resumes from disk, overdue jobs catch up', async () => {
  let runs = 0;
  const job = { name: 'b', intervalMs: 3600_000, run: async () => { runs += 1; } };
  const s1 = new Scheduler({ jobs: [job], logger: quiet });
  await s1.tick();
  // simulate downtime: job became overdue while the server was off
  const st = store.readJson('jobs/state.json', {});
  st.b.nextRunAt = new Date(Date.now() - 1000).toISOString();
  store.writeJson('jobs/state.json', st);
  const s2 = new Scheduler({ jobs: [job], logger: quiet, tickMs: 3600_000 });
  s2.start(); // staggers overdue jobs a few seconds into the future
  s2.stop();
  const staggered = Date.parse(store.readJson('jobs/state.json', {}).b.nextRunAt);
  assert.ok(staggered > Date.now() && staggered < Date.now() + 120_000, 'overdue job rescheduled for catch-up shortly after boot');
  await s2.tick(staggered + 1);
  assert.equal(runs, 2);
  assert.equal(store.readJson('jobs/state.json', {}).b.runs, 2, 'run count persisted across instances');
});

test('failures back off exponentially, are logged (never silent), and alert after 3 in a row', async () => {
  const s = new Scheduler({ jobs: [{ name: 'f', intervalMs: 24 * 3600_000, run: async () => { throw new Error('boom apikey=SECRET'); } }], logger: quiet });
  const delays = [];
  for (let i = 0; i < 3; i += 1) {
    const before = Date.now();
    await s.runJob('f');
    delays.push(Date.parse(s.state().f.nextRunAt) - before);
  }
  assert.ok(delays[0] >= 110_000 && delays[0] <= 125_000, `first backoff ~2min, got ${delays[0]}`);
  assert.ok(delays[1] >= 230_000 && delays[2] >= 470_000, 'doubles each time');
  const st = s.state().f;
  assert.equal(st.consecutiveFailures, 3);
  assert.equal(st.lastStatus, 'failed');
  assert.doesNotMatch(st.lastError, /SECRET/, 'secrets redacted in job errors');
  assert.equal(store.readJsonl('jobs/alerts.jsonl').length, 1);
  assert.equal(store.readJsonl('jobs/runs.jsonl').filter((r) => r.status === 'failed').length, 3);
});

test('a recovered job resets its failure count', async () => {
  let fail = true;
  const s = new Scheduler({ jobs: [{ name: 'r', intervalMs: 3600_000, run: async () => { if (fail) throw new Error('x'); } }], logger: quiet });
  await s.runJob('r');
  fail = false;
  await s.runJob('r');
  assert.equal(s.state().r.consecutiveFailures, 0);
  assert.equal(s.state().r.lastStatus, 'ok');
});

test('timeouts are enforced', async () => {
  const s = new Scheduler({ jobs: [{ name: 't', intervalMs: 3600_000, timeoutMs: 100, run: () => new Promise((r) => setTimeout(r, 2000)) }], logger: quiet });
  const rec = await s.runJob('t');
  assert.equal(rec.status, 'timeout');
});

test('duplicate execution is prevented by the shared lock', async () => {
  let runs = 0;
  const job = { name: 'd', intervalMs: 3600_000, run: async () => { runs += 1; } };
  const other = new Scheduler({ jobs: [job], logger: quiet });
  assert.ok(store.acquireLock('job-d')); // another process holds the lock
  const rec = await other.runJob('d');
  assert.equal(rec.status, 'skipped');
  assert.equal(runs, 0);
  store.releaseLock('job-d');
  await other.runJob('d');
  assert.equal(runs, 1);
});

test('a stale lock (crashed process) is taken over', () => {
  const file = path.join(dir, 'locks', 'job-z.lock');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ pid: 1, at: Date.now() - 3 * 3600_000 }));
  assert.ok(store.acquireLock('job-z', { staleMs: 3600_000 }));
});

test('unmet requirements are recorded as skipped with a reason, not as success', async () => {
  const s = new Scheduler({ jobs: [{ name: 'q', intervalMs: 3600_000, requires: () => 'BING_WEBMASTER_API_KEY not set', run: async () => { throw new Error('should not run'); } }], logger: quiet });
  const rec = await s.runJob('q');
  assert.equal(rec.status, 'skipped');
  assert.equal(s.state().q.lastReason, 'BING_WEBMASTER_API_KEY not set');
});

test('page changes are versioned with reasons and can be rolled back', () => {
  pages.savePageVersion('service:ai-development', { kind: 'override', status: 'published', data: { title: 'Title A for testing rollback' }, by: 'test', reason: 'first' });
  pages.savePageVersion('service:ai-development', { kind: 'override', data: { title: 'Title B for testing rollback' }, by: 'test', reason: 'second' });
  assert.equal(pages.currentData(pages.getPage('service:ai-development')).title, 'Title B for testing rollback');
  pages.rollbackPage('service:ai-development', 1, { by: 'test' });
  const p = pages.getPage('service:ai-development');
  assert.equal(pages.currentData(p).title, 'Title A for testing rollback');
  assert.equal(p.versions.length, 3, 'rollback adds a version, never deletes history');
  const changes = learning.listChanges();
  assert.equal(changes.length, 3);
  assert.equal(changes[0].type, 'rollback');
  assert.equal(changes[1].before.title, 'Title A for testing rollback', 'previous version recorded');
});

test('admin API: rollback and status endpoints work end-to-end; failed drafts cannot be published', async () => {
  const srv = await startServer();
  try {
    const cookie = await login(srv.base);
    process.env.SEO_DATA_DIR = srv.dataDir;
    pages.savePageVersion('service:seo-digital-marketing', { kind: 'override', status: 'published', data: { title: 'SEO Override Title One for Phoenix' }, reason: 'test' });
    pages.savePageVersion('service:seo-digital-marketing', { kind: 'override', data: { title: 'SEO Override Title Two for Phoenix' }, reason: 'test' });
    let html = await (await fetch(`${srv.base}/services/seo-digital-marketing`)).text();
    assert.match(html, /<title>SEO Override Title Two for Phoenix<\/title>/);
    const rb = await fetch(`${srv.base}/api/admin/seo/pages/service:seo-digital-marketing/rollback`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ version: 1 }) });
    assert.equal(rb.status, 200);
    html = await (await fetch(`${srv.base}/services/seo-digital-marketing`)).text();
    assert.match(html, /<title>SEO Override Title One for Phoenix<\/title>/);
    pages.savePageVersion('article:bad-draft', { kind: 'article', status: 'draft', data: { title: 'x', gate: { passed: false, failures: [{ check: 'depth' }] } }, reason: 'test' });
    const pub = await fetch(`${srv.base}/api/admin/seo/pages/article:bad-draft/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ status: 'published' }) });
    assert.equal(pub.status, 409);
    const run = await fetch(`${srv.base}/api/admin/seo/jobs/url-state/run`, { method: 'POST', headers: { cookie } });
    const rec = await run.json();
    assert.equal(rec.status, 'ok');
    assert.ok(rec.summary.added.includes('/services'));
  } finally { await srv.stop(); }
});
