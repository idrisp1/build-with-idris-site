// Bing Webmaster Tools API, JSON endpoint only (the legacy SOAP and POX
// endpoints are retired on 2026-08-31). Auth: API key generated in Bing
// Webmaster Tools -> Settings -> API access, provided as BING_WEBMASTER_API_KEY.
// The key is sent as a query parameter (Bing's documented scheme) and is
// redacted from every log line and error message.
import { config, secret } from '../config.js';
import { fetchWithRetry, redact } from './http.js';

export function isConfigured() {
  return Boolean(secret('BING_WEBMASTER_API_KEY'));
}

function siteUrl() {
  return `${config().origin}/`;
}

// Bing JSON responses wrap the payload in { d: ... } and encode dates as
// "/Date(1700000000000)/" or "/Date(1700000000000-0700)/".
export function normalize(value) {
  if (typeof value === 'string') {
    const m = value.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/);
    return m ? new Date(Number(m[1])).toISOString() : value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (k !== '__type') out[k] = normalize(v);
    return out;
  }
  return value;
}

async function call(method, { query = {}, body, fetchImpl } = {}) {
  const key = secret('BING_WEBMASTER_API_KEY');
  if (!key) throw new Error('BING_WEBMASTER_API_KEY is not set.');
  const url = new URL(`${config().bingApiBase}/${method}`);
  url.searchParams.set('apikey', key);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetchWithRetry(url.toString(), body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  } : { method: 'GET' }, { attempts: 3, fetchImpl });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bing ${method} failed: HTTP ${res.status} ${redact(text).slice(0, 300)}`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Bing ${method}: non-JSON response`); }
  return normalize(json && Object.prototype.hasOwnProperty.call(json, 'd') ? json.d : json);
}

export const getQueryStats = (o = {}) => call('GetQueryStats', { query: { siteUrl: siteUrl() }, ...o });
export const getPageStats = (o = {}) => call('GetPageStats', { query: { siteUrl: siteUrl() }, ...o });
export const getRankAndTrafficStats = (o = {}) => call('GetRankAndTrafficStats', { query: { siteUrl: siteUrl() }, ...o });
export const getCrawlStats = (o = {}) => call('GetCrawlStats', { query: { siteUrl: siteUrl() }, ...o });
export const getCrawlIssues = (o = {}) => call('GetCrawlIssues', { query: { siteUrl: siteUrl() }, ...o });
export const getUrlSubmissionQuota = (o = {}) => call('GetUrlSubmissionQuota', { query: { siteUrl: siteUrl() }, ...o });
export const getFeeds = (o = {}) => call('GetFeeds', { query: { siteUrl: siteUrl() }, ...o });
export const submitFeed = (feedUrl, o = {}) => call('SubmitFeed', { body: { siteUrl: siteUrl(), feedUrl }, ...o });
export const getUrlInfo = (url, o = {}) => call('GetUrlInfo', { query: { siteUrl: siteUrl(), url }, ...o });

// Keyword research (Bing-wide data, not site-specific).
export const getRelatedKeywords = (q, o = {}) => call('GetRelatedKeywords', { query: { q, country: 'us', language: 'en-US', startDate: o.startDate || '', endDate: o.endDate || '' }, fetchImpl: o.fetchImpl });
export const getKeyword = (q, o = {}) => {
  const end = new Date(); const start = new Date(end); start.setUTCDate(start.getUTCDate() - 90);
  return call('GetKeyword', { query: { q, country: 'us', language: 'en-US', startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }, fetchImpl: o.fetchImpl });
};

// URL submission (fallback when IndexNow is rejected or unreachable). Bing's own
// docs disagree on the method casing (SubmitUrlBatch vs SubmitUrlbatch), so the
// documented alternative is tried if the first is unknown to the endpoint.
export async function submitUrlBatch(urls, o = {}) {
  const body = { siteUrl: siteUrl(), urlList: urls.slice(0, 500) };
  try {
    return await call('SubmitUrlBatch', { body, ...o });
  } catch (err) {
    if (/HTTP (400|404)/.test(err.message) && /method|endpoint|not found|unknown/i.test(err.message)) return call('SubmitUrlbatch', { body, ...o });
    throw err;
  }
}

// Respects the daily URL-submission quota reported by Bing.
export async function submitWithinQuota(urls, o = {}) {
  const quota = await getUrlSubmissionQuota(o);
  const daily = Number(quota?.DailyQuota ?? 0);
  if (!daily) return { submitted: 0, reason: 'no remaining daily quota', quota };
  const batch = urls.slice(0, daily);
  await submitUrlBatch(batch, o);
  return { submitted: batch.length, quota };
}
