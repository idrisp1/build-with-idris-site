// Persistent in-process job scheduler. Runs inside the always-on Express
// server on Railway, so jobs keep running when no browser, admin session or
// local machine is involved. Job state lives on the volume, so restarts and
// redeploys resume where they left off (overdue jobs catch up on boot).
//
// Guarantees:
//  - one run per job at a time (file lock shared by every process on the volume)
//  - per-job timeout
//  - exponential backoff after failures (2 min, 4, 8 ... capped at the interval)
//  - every run (ok / failed / skipped / timeout) is appended to jobs/runs.jsonl;
//    repeated failures raise an alert record, so nothing fails silently
import { readJson, writeJson, appendJsonl, acquireLock, releaseLock } from './store.js';
import { redact } from './integrations/http.js';

const BACKOFF_BASE_MS = 2 * 60 * 1000;
const ALERT_AFTER_FAILURES = 3;

export class Scheduler {
  constructor({ jobs, tickMs = 60_000, logger = console }) {
    this.jobs = new Map(jobs.map((j) => [j.name, j]));
    this.tickMs = tickMs;
    this.logger = logger;
    this.timer = null;
    this.running = new Set();
  }

  state() {
    return readJson('jobs/state.json', {});
  }

  saveJobState(name, patch) {
    const s = this.state();
    s[name] = { ...(s[name] || {}), ...patch };
    writeJson('jobs/state.json', s);
    return s[name];
  }

  start() {
    // Catch-up: overdue jobs (e.g. after downtime) are staggered 30s apart so a
    // restart doesn't fire every API call at once.
    const s = this.state();
    let stagger = 15_000;
    const now = Date.now();
    for (const job of this.jobs.values()) {
      const js = s[job.name];
      if (!js?.nextRunAt || Date.parse(js.nextRunAt) <= now) {
        this.saveJobState(job.name, { nextRunAt: new Date(now + stagger).toISOString() });
        stagger += 30_000;
      }
    }
    this.timer = setInterval(() => { this.tick().catch((err) => this.logger.error('[seo-scheduler] tick error', err)); }, this.tickMs);
    this.timer.unref?.();
    this.logger.log(`[seo-scheduler] started with ${this.jobs.size} jobs`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = Date.now()) {
    const s = this.state();
    const due = [...this.jobs.values()].filter((j) => !this.running.has(j.name) && (!s[j.name]?.nextRunAt || Date.parse(s[j.name].nextRunAt) <= now));
    // Sequential: keeps API usage and memory low on a small Railway instance.
    for (const job of due) await this.runJob(job.name, { trigger: 'schedule' });
  }

  async runJob(name, { trigger = 'manual' } = {}) {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Unknown job ${name}`);
    if (this.running.has(name)) return { status: 'already-running' };
    if (!acquireLock(`job-${name}`, { staleMs: (job.timeoutMs || 300_000) * 2 })) {
      const rec = { at: new Date().toISOString(), job: name, trigger, status: 'skipped', reason: 'locked by another process' };
      appendJsonl('jobs/runs.jsonl', rec);
      return rec;
    }
    this.running.add(name);
    const startedAt = Date.now();
    const prev = this.state()[name] || {};
    let status = 'ok';
    let result = null;
    let error = null;
    let reason = null;
    try {
      const unmet = job.requires ? job.requires() : null;
      if (unmet) {
        status = 'skipped';
        reason = unmet;
      } else {
        let timeoutHandle;
        const timeout = new Promise((_r, reject) => { timeoutHandle = setTimeout(() => reject(new Error(`timed out after ${job.timeoutMs}ms`)), job.timeoutMs || 300_000); });
        try {
          result = await Promise.race([job.run(), timeout]);
        } finally {
          clearTimeout(timeoutHandle);
        }
      }
    } catch (err) {
      status = /timed out/.test(err.message) ? 'timeout' : 'failed';
      error = redact(err.message || String(err)).slice(0, 500);
    } finally {
      this.running.delete(name);
      releaseLock(`job-${name}`);
    }
    const failures = status === 'failed' || status === 'timeout' ? (prev.consecutiveFailures || 0) + 1 : 0;
    const delay = failures ? Math.min(job.intervalMs, BACKOFF_BASE_MS * 2 ** (failures - 1)) : job.intervalMs;
    const finishedAt = new Date().toISOString();
    this.saveJobState(name, {
      lastRunAt: new Date(startedAt).toISOString(), lastFinishedAt: finishedAt, lastStatus: status, lastTrigger: trigger,
      lastError: error, lastReason: reason, lastDurationMs: Date.now() - startedAt, consecutiveFailures: failures,
      nextRunAt: new Date(Date.now() + delay).toISOString(), runs: (prev.runs || 0) + 1,
      lastSummary: summarize(result)
    });
    const rec = { at: finishedAt, job: name, trigger, status, durationMs: Date.now() - startedAt, error, reason, summary: summarize(result) };
    appendJsonl('jobs/runs.jsonl', rec);
    if (failures >= ALERT_AFTER_FAILURES) {
      appendJsonl('jobs/alerts.jsonl', { at: finishedAt, job: name, consecutiveFailures: failures, error });
      this.logger.error(`[seo-scheduler] ALERT ${name} failed ${failures} times in a row: ${error}`);
    }
    return rec;
  }

  describe() {
    const s = this.state();
    return [...this.jobs.values()].map((j) => ({ name: j.name, description: j.description, intervalMs: j.intervalMs, running: this.running.has(j.name), ...(s[j.name] || {}) }));
  }
}

function summarize(result) {
  if (result === null || result === undefined) return null;
  try {
    const text = JSON.stringify(result);
    return text.length > 600 ? `${text.slice(0, 600)}…` : JSON.parse(text);
  } catch { return null; }
}
