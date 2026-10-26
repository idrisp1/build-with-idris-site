import { google } from 'googleapis';

// Search performance monitoring via the official Google Search Console API.
// Entirely optional and off until configured: reads credentials from
// environment variables only (GSC_SERVICE_ACCOUNT_JSON, GSC_SITE_URL) -- never
// from a file committed to the repo, per the standing "no secrets in source
// control" rule already followed elsewhere in this project (backend/.env is
// gitignored the same way).
//
// Auth: a Google Cloud service account with the least-privileged
// `webmasters.readonly` scope -- read-only, no ability to change settings or
// submit/delete anything in Search Console. The service account's own email
// (looks like name@project.iam.gserviceaccount.com) must be added as a user
// in Search Console -> Settings -> Users and permissions, "Restricted"
// permission is sufficient since this only ever reads.

const READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const CACHE_TTL_MS = 15 * 60 * 1000; // avoid hammering the API on every dashboard view
const cache = new Map(); // key: `${siteUrl}|${days}` -> { data, fetchedAt }

function getSiteUrl() {
  const explicit = String(process.env.GSC_SITE_URL || '').trim();
  if (explicit) return explicit;
  const origin = String(process.env.FRONTEND_ORIGIN || '').trim();
  return origin ? `${origin.replace(/\/$/, '')}/` : '';
}

function getCredentials() {
  const raw = String(process.env.GSC_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isConfigured() {
  return Boolean(getCredentials() && getSiteUrl());
}

export function getStatus() {
  const creds = getCredentials();
  return {
    configured: Boolean(creds && getSiteUrl()),
    siteUrl: getSiteUrl() || null,
    credentialsPresent: Boolean(creds),
    serviceAccountEmail: creds?.client_email || null
  };
}

function getAuthClient() {
  const creds = getCredentials();
  if (!creds) throw new Error('GSC_SERVICE_ACCOUNT_JSON is not set or is not valid JSON.');
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [READONLY_SCOPE]
  });
}

function dateDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function queryRows(searchconsole, siteUrl, { startDate, endDate, dimensions, rowLimit }) {
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions, rowLimit: rowLimit || 1000 }
  });
  return res.data.rows || [];
}

// Search Console's own data has a ~2-3 day reporting lag -- end the range a
// few days back rather than "today," or the most recent days would always
// show as empty/zero and look like a bug.
const REPORTING_LAG_DAYS = 3;

export async function getSummary({ days = 28 } = {}) {
  const siteUrl = getSiteUrl();
  if (!siteUrl) throw new Error('No site URL configured (GSC_SITE_URL or FRONTEND_ORIGIN).');
  const safeDays = Math.min(Math.max(Number(days) || 28, 7), 90); // configurable, but bounded to keep requests reasonable

  const cacheKey = `${siteUrl}|${safeDays}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const auth = getAuthClient();
  const searchconsole = google.searchconsole({ version: 'v1', auth });

  const endDate = dateDaysAgo(REPORTING_LAG_DAYS);
  const startDate = dateDaysAgo(REPORTING_LAG_DAYS + safeDays);

  const [totalsRows, queryRowsData, pageRowsData, sitemapsRes, inspectionRes] = await Promise.all([
    queryRows(searchconsole, siteUrl, { startDate, endDate, dimensions: [] }),
    queryRows(searchconsole, siteUrl, { startDate, endDate, dimensions: ['query'], rowLimit: 15 }),
    queryRows(searchconsole, siteUrl, { startDate, endDate, dimensions: ['page'], rowLimit: 15 }),
    searchconsole.sitemaps.list({ siteUrl }).catch(() => ({ data: {} })),
    // Real per-URL indexing status (distinct from sitemap processing status) via the
    // URL Inspection API -- same read-only scope covers this, no extra permission needed.
    searchconsole.urlInspection.index
      .inspect({ requestBody: { inspectionUrl: siteUrl, siteUrl } })
      .catch((err) => ({ data: { error: err.message } }))
  ]);

  const totals = totalsRows[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const sitemaps = (sitemapsRes.data.sitemap || []).map((s) => ({
    path: s.path,
    lastSubmitted: s.lastSubmitted || null,
    lastDownloaded: s.lastDownloaded || null,
    isPending: Boolean(s.isPending),
    errors: s.errors || 0,
    warnings: s.warnings || 0
  }));

  const idx = inspectionRes.data?.inspectionResult?.indexStatusResult;
  const indexing = idx
    ? {
        verdict: idx.verdict || null,
        coverageState: idx.coverageState || null,
        robotsTxtState: idx.robotsTxtState || null,
        lastCrawlTime: idx.lastCrawlTime || null,
        pageFetchState: idx.pageFetchState || null
      }
    : { error: inspectionRes.data?.error || 'Could not fetch indexing status.' };

  const data = {
    siteUrl,
    rangeDays: safeDays,
    startDate,
    endDate,
    totals: {
      clicks: totals.clicks || 0,
      impressions: totals.impressions || 0,
      ctr: totals.ctr || 0,
      position: totals.position || 0
    },
    topQueries: queryRowsData.map((r) => ({
      query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position
    })),
    topPages: pageRowsData.map((r) => ({
      page: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position
    })),
    sitemaps,
    indexing,
    generatedAt: new Date().toISOString(),
    cached: false
  };

  cache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}
