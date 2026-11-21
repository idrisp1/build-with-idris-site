// Core Web Vitals via Google's PageSpeed Insights API v5 (official). Records
// lab metrics (Lighthouse) and, when Google has enough real-user traffic for
// the URL/origin, CrUX field data (LCP, INP, CLS). An API key is optional
// (PAGESPEED_API_KEY); without one Google's shared keyless quota applies and a
// 429 is recorded as "quota" and retried on the next run.
import { secret } from '../config.js';
import { appendJsonl, readJson, writeJson } from '../store.js';
import { fetchWithRetry, redact } from './http.js';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

function num(audits, id) {
  const v = audits?.[id]?.numericValue;
  return typeof v === 'number' ? Math.round(v * (id === 'cumulative-layout-shift' ? 1000 : 1)) / (id === 'cumulative-layout-shift' ? 1000 : 1) : null;
}

function field(exp) {
  const m = exp?.metrics;
  if (!m) return null;
  const pick = (k) => (m[k] ? { p75: m[k].percentile, category: m[k].category } : null);
  return {
    overall: exp.overall_category || null,
    lcpMs: pick('LARGEST_CONTENTFUL_PAINT_MS'),
    inpMs: pick('INTERACTION_TO_NEXT_PAINT'),
    cls: pick('CUMULATIVE_LAYOUT_SHIFT_SCORE')
  };
}

export async function measure(url, { strategy = 'mobile', fetchImpl, endpoint = ENDPOINT } = {}) {
  const q = new URL(endpoint);
  q.searchParams.set('url', url);
  q.searchParams.set('strategy', strategy);
  q.searchParams.set('category', 'performance');
  const key = secret('PAGESPEED_API_KEY');
  if (key) q.searchParams.set('key', key);
  const res = await fetchWithRetry(q.toString(), { method: 'GET' }, { attempts: 2, timeoutMs: 90_000, fetchImpl });
  const text = await res.text();
  if (!res.ok) throw new Error(`PageSpeed HTTP ${res.status}: ${redact(text).slice(0, 200)}`);
  const j = JSON.parse(text);
  const audits = j.lighthouseResult?.audits || {};
  return {
    url, strategy, at: new Date().toISOString(),
    lab: {
      performance: j.lighthouseResult?.categories?.performance?.score != null ? Math.round(j.lighthouseResult.categories.performance.score * 100) : null,
      lcpMs: num(audits, 'largest-contentful-paint'),
      cls: num(audits, 'cumulative-layout-shift'),
      tbtMs: num(audits, 'total-blocking-time'),
      fcpMs: num(audits, 'first-contentful-paint')
    },
    field: field(j.loadingExperience),
    originField: field(j.originLoadingExperience)
  };
}

export async function run(urls, opts = {}) {
  const latest = readJson('reports/cwv-latest.json', { pages: {} });
  const results = { at: new Date().toISOString(), measured: 0, quota: 0, errors: [] };
  for (const url of urls) {
    try {
      const m = await measure(url, opts);
      latest.pages[url] = m;
      appendJsonl('history/cwv.jsonl', m);
      results.measured += 1;
    } catch (err) {
      if (/HTTP 429/.test(err.message)) results.quota += 1;
      else results.errors.push(`${url}: ${err.message}`);
    }
  }
  latest.at = results.at;
  writeJson('reports/cwv-latest.json', latest);
  if (!results.measured && (results.quota || results.errors.length)) {
    throw new Error(results.quota ? 'PageSpeed quota exhausted (429); set PAGESPEED_API_KEY for a dedicated free quota' : results.errors.join('; '));
  }
  return results;
}
