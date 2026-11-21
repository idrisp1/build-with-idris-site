// IndexNow (https://www.indexnow.org/documentation). One POST to the shared
// endpoint notifies all participating engines (Bing, Yandex, Seznam, Naver...).
// Google does not participate; it discovers changes via the sitemap.
//
// Status semantics recorded honestly:
//   200 -> "received" (the engine got the URLs; NOT indexed)
//   202 -> "received-key-pending" (key verification still pending)
//   400/403/422 -> "rejected" (bad request / key not valid / URLs don't match host); not retried
//   429 / 5xx / network -> retried with backoff, then queued for the next run
import crypto from 'node:crypto';
import { config, secret } from '../config.js';
import { readJson, writeJson, appendJsonl } from '../store.js';
import { fetchWithRetry, HttpError } from './http.js';

const MIN_INTERVAL_MS = 10 * 60 * 1000; // never hammer the endpoint
const MAX_BATCH = 10_000;

export function getKey() {
  const fromEnv = secret('INDEXNOW_KEY');
  if (/^[a-zA-Z0-9-]{8,128}$/.test(fromEnv)) return fromEnv;
  const stored = readJson('indexnow-key.json', null);
  if (stored?.key) return stored.key;
  // The key is public by design (it is served at /<key>.txt); generating it
  // once and persisting it on the volume keeps it stable across redeploys.
  const key = crypto.randomBytes(16).toString('hex');
  writeJson('indexnow-key.json', { key, createdAt: new Date().toISOString() });
  return key;
}

export function queue() {
  return readJson('indexnow-queue.json', { pending: [], lastSubmitAt: null });
}

export function enqueue(urls) {
  const q = queue();
  const set = new Set(q.pending);
  for (const u of urls) set.add(u);
  q.pending = [...set];
  writeJson('indexnow-queue.json', q);
  return q;
}

function classify(status) {
  if (status === 200) return 'received';
  if (status === 202) return 'received-key-pending';
  if (status === 400 || status === 403 || status === 422) return 'rejected';
  return 'error';
}

// Submits everything in the queue (deduplicated, same-host only). Returns a
// result object; never throws for an engine-side rejection.
export async function flush({ force = false, fetchImpl } = {}) {
  const cfg = config();
  const q = queue();
  if (!q.pending.length) return { submitted: 0, status: 'nothing-to-submit' };
  if (!cfg.indexNowEnabled) return { submitted: 0, status: 'disabled', pending: q.pending.length };
  if (!force && q.lastSubmitAt && Date.now() - Date.parse(q.lastSubmitAt) < MIN_INTERVAL_MS) {
    return { submitted: 0, status: 'rate-limited-locally', pending: q.pending.length };
  }
  const host = new URL(cfg.origin).host;
  const urls = q.pending.filter((u) => { try { return new URL(u).host === host; } catch { return false; } }).slice(0, MAX_BATCH);
  const key = getKey();
  const body = { host, key, keyLocation: `${cfg.origin}/${key}.txt`, urlList: urls };
  let status;
  let note = '';
  try {
    const res = await fetchWithRetry(cfg.indexNowEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body)
    }, { attempts: 3, fetchImpl });
    status = res.status;
    note = (await res.text().catch(() => '')).slice(0, 300);
  } catch (err) {
    status = err instanceof HttpError ? (err.status || 0) : 0;
    note = err.message;
  }
  const outcome = classify(status);
  const entry = { at: new Date().toISOString(), endpoint: cfg.indexNowEndpoint, httpStatus: status, outcome, count: urls.length, urls, note };
  appendJsonl('history/indexnow.jsonl', entry);
  const after = queue();
  if (outcome === 'received' || outcome === 'received-key-pending' || outcome === 'rejected') {
    // Rejected URLs are not retried blindly (they would be rejected again);
    // the failure is visible in the log and the admin status panel.
    after.pending = after.pending.filter((u) => !urls.includes(u));
  }
  after.lastSubmitAt = entry.at;
  after.lastOutcome = outcome;
  writeJson('indexnow-queue.json', after);
  return { submitted: urls.length, status: outcome, httpStatus: status };
}
