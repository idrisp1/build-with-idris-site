// Central configuration for the SEO engine. Everything is read from environment
// variables at call time (not import time) so tests and the running server can
// change behaviour without code edits. Secrets are only ever read here and never
// written to disk, logs, or responses.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = path.join(__dirname, '..');
export const PROJECT_ROOT = path.join(BACKEND_DIR, '..');

function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === null ? fallback : String(v).trim();
}

function envBool(name, fallback) {
  const v = env(name, '');
  if (!v) return fallback;
  return !/^(0|false|no|off)$/i.test(v);
}

function envNum(name, fallback) {
  const n = Number(env(name, ''));
  return Number.isFinite(n) && env(name, '') !== '' ? n : fallback;
}

export function siteOrigin() {
  return env('FRONTEND_ORIGIN', `http://127.0.0.1:${env('PORT', '8095')}`).replace(/\/$/, '');
}

// SEO data lives next to content.json on the same Railway volume, in its own
// folder so it can never collide with (or corrupt) the existing site content.
export function dataDir() {
  return env('SEO_DATA_DIR', path.join(BACKEND_DIR, 'data', 'seo'));
}

export function config() {
  return {
    origin: siteOrigin(),
    nodeEnv: env('NODE_ENV', 'development'),
    // Scheduler: on by default in production, off by default in local dev so a
    // laptop never runs jobs against production APIs by accident.
    schedulerEnabled: envBool('SEO_SCHEDULER_ENABLED', env('NODE_ENV') === 'production'),
    schedulerTickMs: envNum('SEO_SCHEDULER_TICK_MS', 60_000),
    // Content agent: deterministic only (owner decision 2026-11-21, no LLM / no API cost).
    // Integrations
    gscSiteUrl: env('GSC_SITE_URL') || `${siteOrigin()}/`,
    gscConfigured: Boolean(env('GSC_SERVICE_ACCOUNT_JSON')),
    bingApiKeyConfigured: Boolean(env('BING_WEBMASTER_API_KEY')),
    bingApiBase: env('BING_API_BASE', 'https://ssl.bing.com/webmaster/api.svc/json'),
    bingSiteVerification: env('BING_SITE_VERIFICATION'),
    indexNowEndpoint: env('INDEXNOW_ENDPOINT', 'https://api.indexnow.org/indexnow'),
    indexNowEnabled: envBool('INDEXNOW_ENABLED', env('NODE_ENV') === 'production'),
    // Owner-confirmed (2026-11-21): Phoenix in person, remote anywhere in the U.S.
    areaServed: { city: 'Phoenix', region: 'AZ', country: 'United States' }
  };
}

export function secret(name) {
  return env(name);
}
