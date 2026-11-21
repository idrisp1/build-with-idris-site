// Google Search Console API (official googleapis client), using the SAME
// service account already configured for the admin "Search Insights" panel
// (GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL). Reads use the read-only scope.
// Sitemap submission needs the read/write `webmasters` scope AND the service
// account must have "Full" (or Owner) permission on the property; if it only
// has "Restricted", submission returns 403 and that is reported as a setup
// item instead of being retried.
//
// Note: Search Console has no API to force indexing of ordinary pages (the
// Indexing API is limited to JobPosting/BroadcastEvent pages). Discovery is
// facilitated through the sitemap; indexing is only ever REPORTED from the
// URL Inspection API, never assumed.
import { google } from 'googleapis';
import { config, secret } from '../config.js';
import { readJson, writeJson, appendJsonl, exists } from '../store.js';
import * as oauth from './googleOAuth.js';

const READONLY = 'https://www.googleapis.com/auth/webmasters.readonly';
const READWRITE = 'https://www.googleapis.com/auth/webmasters';
const REPORTING_LAG_DAYS = 3;
const BACKFILL_DAYS = 90;

export function isConfigured() {
  return Boolean(credentials()) || oauth.isConnected();
}

// Which credential is in use: an OAuth connection as the property owner
// (preferred: full permission) or the service account.
export function authMode() {
  if (oauth.isConnected()) return 'oauth';
  if (credentials()) return 'service-account';
  return 'none';
}

function credentials() {
  try { return JSON.parse(secret('GSC_SERVICE_ACCOUNT_JSON')); } catch { return null; }
}

function client(scope) {
  const owner = oauth.authClient();
  if (owner) return google.searchconsole({ version: 'v1', auth: owner });
  const creds = credentials();
  if (!creds) throw new Error('GSC_SERVICE_ACCOUNT_JSON is not set or invalid (and Google OAuth is not connected).');
  const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes: [scope] });
  return google.searchconsole({ version: 'v1', auth });
}

function day(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

async function query(sc, body) {
  const res = await sc.searchanalytics.query({ siteUrl: config().gscSiteUrl, requestBody: body });
  return res.data.rows || [];
}

// Daily sync: fetches every finalized day not yet stored (backfilling up to 90
// days on first run). One file per day keeps history append-only and lets a
// failed run resume exactly where it stopped.
export async function syncSearchAnalytics({ maxDays = 30 } = {}) {
  const sc = client(READONLY);
  const lastFinal = day(REPORTING_LAG_DAYS);
  const days = [];
  for (let i = BACKFILL_DAYS + REPORTING_LAG_DAYS; i >= REPORTING_LAG_DAYS; i -= 1) {
    const d = day(i);
    if (!exists(`gsc/daily/${d}.json`)) days.push(d);
  }
  days.reverse(); // newest first, so analysis is current after the first run; older days backfill later
  const todo = days.slice(0, maxDays); // bounded per run; remaining days are picked up next run
  for (const d of todo) {
    const base = { startDate: d, endDate: d, rowLimit: 25000, dataState: 'final' };
    const [pageQuery, pages, devices, countries] = await Promise.all([
      query(sc, { ...base, dimensions: ['page', 'query'] }),
      query(sc, { ...base, dimensions: ['page'] }),
      query(sc, { ...base, dimensions: ['page', 'device'] }),
      query(sc, { ...base, dimensions: ['country'] })
    ]);
    const map = (rows, dims) => rows.map((r) => ({ ...Object.fromEntries(dims.map((k, i) => [k, r.keys[i]])), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
    writeJson(`gsc/daily/${d}.json`, {
      date: d,
      fetchedAt: new Date().toISOString(),
      pageQuery: map(pageQuery, ['page', 'query']),
      pages: map(pages, ['page']),
      devices: map(devices, ['page', 'device']),
      countries: map(countries, ['country'])
    });
  }
  return { fetchedDays: todo, remaining: days.length - todo.length, lastFinal };
}

// URL Inspection for each public URL (quota: 2,000/day/property; we use ~20).
export async function inspectUrls(urls) {
  const sc = client(READONLY);
  const results = readJson('gsc/inspection.json', {});
  for (const url of urls) {
    try {
      const res = await sc.urlInspection.index.inspect({ requestBody: { inspectionUrl: url, siteUrl: config().gscSiteUrl } });
      const r = res.data?.inspectionResult?.indexStatusResult || {};
      results[url] = {
        checkedAt: new Date().toISOString(),
        verdict: r.verdict || null,
        coverageState: r.coverageState || null,
        indexingState: r.indexingState || null,
        robotsTxtState: r.robotsTxtState || null,
        pageFetchState: r.pageFetchState || null,
        lastCrawlTime: r.lastCrawlTime || null,
        googleCanonical: r.googleCanonical || null,
        userCanonical: r.userCanonical || null
      };
    } catch (err) {
      results[url] = { checkedAt: new Date().toISOString(), error: String(err.message || err).slice(0, 300) };
    }
    appendJsonl('gsc/inspection-history.jsonl', { url, ...results[url] });
  }
  writeJson('gsc/inspection.json', results);
  return results;
}

export async function listSitemaps() {
  const sc = client(READONLY);
  const res = await sc.sitemaps.list({ siteUrl: config().gscSiteUrl });
  return (res.data.sitemap || []).map((s) => ({
    path: s.path, lastSubmitted: s.lastSubmitted || null, lastDownloaded: s.lastDownloaded || null,
    isPending: Boolean(s.isPending), errors: Number(s.errors || 0), warnings: Number(s.warnings || 0),
    contents: s.contents || []
  }));
}

export async function submitSitemap(feedUrl) {
  const sc = client(READWRITE);
  try {
    await sc.sitemaps.submit({ siteUrl: config().gscSiteUrl, feedpath: feedUrl });
    return { ok: true };
  } catch (err) {
    const code = err.code || err.response?.status;
    return { ok: false, status: code || null, needsFullPermission: code === 403, error: String(err.message || err).slice(0, 300) };
  }
}
