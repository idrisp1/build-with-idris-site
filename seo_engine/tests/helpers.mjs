// Test helpers: start the REAL server (backend/server.js) on a free port with
// an isolated SEO data directory, and a tiny mock HTTP server for external APIs.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(here, '..', '..');
export const BACKEND = path.join(ROOT, 'backend');
const require = createRequire(path.join(BACKEND, 'package.json'));
const bcrypt = require('bcryptjs');

export const ADMIN_USER = 'test-admin';
export const ADMIN_PASS = 'test-pass-' + Math.random().toString(36).slice(2);

export function tempDir(prefix = 'seo-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

let nextPort = 18100 + Math.floor(Math.random() * 500);

export async function startServer(extraEnv = {}) {
  const port = nextPort++;
  const dataDir = extraEnv.SEO_DATA_DIR || tempDir();
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'test',
    FRONTEND_ORIGIN: base,
    ADMIN_USERNAME: ADMIN_USER,
    ADMIN_PASSWORD_HASH: bcrypt.hashSync(ADMIN_PASS, 4),
    SESSION_SECRET: 'test-secret',
    SEO_DATA_DIR: dataDir,
    SEO_SCHEDULER_ENABLED: 'false',
    GSC_SERVICE_ACCOUNT_JSON: '',
    BING_WEBMASTER_API_KEY: '',
    ...extraEnv
  };
  const proc = spawn(process.execPath, ['server.js'], { cwd: BACKEND, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error(`server did not start:\n${log}`);
  }
  return {
    base, port, dataDir, proc,
    log: () => log,
    stop: () => new Promise((r) => { proc.once('exit', r); proc.kill(); })
  };
}

export async function login(base) {
  const res = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  return res.headers.get('set-cookie').split(';')[0];
}

// Mock external API: handler(req, body) -> { status, body, headers }
export async function mockServer(handler) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      calls.push({ method: req.method, url: req.url, body });
      const out = await handler(req, body, calls.length);
      res.writeHead(out.status || 200, { 'Content-Type': 'application/json', ...(out.headers || {}) });
      res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body ?? {}));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) };
}

// Point the in-process SEO modules at an isolated data dir.
export function useDataDir() {
  const dir = tempDir();
  process.env.SEO_DATA_DIR = dir;
  return dir;
}

export function writeGscDay(dir, date, pages, pageQuery = []) {
  const p = path.join(dir, 'gsc', 'daily');
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, `${date}.json`), JSON.stringify({ date, pages, pageQuery, devices: [], countries: [] }));
}

export function isoDay(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
