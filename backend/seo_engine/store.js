// Persistence for the SEO engine: JSON documents + append-only JSONL logs on the
// same Railway volume as content.json (backend/data), matching the existing
// contentStore pattern (atomic temp-file + rename writes). No new database
// service is needed for a site of this size; every record survives restarts
// and redeploys because the volume does.
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './config.js';

function full(rel) {
  return path.join(dataDir(), rel);
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeJson(rel, value) {
  const filePath = full(rel);
  ensureDirFor(filePath);
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, filePath);
}

export function readJson(rel, fallback) {
  const filePath = full(rel);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    // A corrupt file must not silently become "empty": keep it for inspection.
    try { fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    return fallback;
  }
}

export function appendJsonl(rel, record) {
  const filePath = full(rel);
  ensureDirFor(filePath);
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n');
}

export function readJsonl(rel, { limit } = {}) {
  const filePath = full(rel);
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch { return []; }
  const lines = raw.split('\n').filter(Boolean);
  const slice = limit ? lines.slice(-limit) : lines;
  const out = [];
  for (const line of slice) {
    try { out.push(JSON.parse(line)); } catch { /* skip a torn last line after a crash */ }
  }
  return out;
}

export function listFiles(relDir) {
  try { return fs.readdirSync(full(relDir)).sort(); } catch { return []; }
}

export function exists(rel) {
  return fs.existsSync(full(rel));
}

export function remove(rel) {
  try { fs.unlinkSync(full(rel)); return true; } catch { return false; }
}

// Exclusive lock using O_EXCL file creation, with a staleness timeout so a
// crashed process can't hold a lock forever. Used to prevent two scheduler
// instances (e.g. during a Railway zero-downtime redeploy overlap) from
// running the same job at the same time.
export function acquireLock(name, { staleMs = 30 * 60 * 1000 } = {}) {
  const filePath = full(`locks/${name}.lock`);
  ensureDirFor(filePath);
  const payload = JSON.stringify({ pid: process.pid, at: Date.now() });
  try {
    fs.writeFileSync(filePath, payload, { flag: 'wx' });
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    try {
      const held = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Date.now() - (held.at || 0) > staleMs) {
        fs.unlinkSync(filePath);
        fs.writeFileSync(filePath, payload, { flag: 'wx' });
        return true;
      }
    } catch { /* another process won the race */ }
    return false;
  }
}

export function releaseLock(name) {
  try { fs.unlinkSync(full(`locks/${name}.lock`)); } catch { /* already gone */ }
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
