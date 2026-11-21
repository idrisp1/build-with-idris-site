// SEO & AI-discovery engine: wires rendering, measurement, integrations,
// agents and the scheduler into the EXISTING Express app (server.js). Nothing
// here replaces existing features: admin editing, content API, uploads,
// messages, reviews and the Search Insights panel are untouched.
import fs from 'node:fs';
import { config } from './config.js';
import { readJson, writeJson, readJsonl, today } from './store.js';
import { loadSite } from './evidence.js';
import { SERVICES } from './catalog.js';
import { prerenderHome } from './render/home.js';
import { renderServicesHub, renderServicePage, renderProjectPage, renderInsightsIndex, renderArticle, renderNotFound, projectSlug } from './render/pages.js';
import { publicPaths, refreshUrlState, sitemapXml, robotsTxt, llmsTxt, urlState } from './render/discovery.js';
import * as analytics from './analytics.js';
import * as indexnow from './integrations/indexnow.js';
import * as gsc from './integrations/gsc.js';
import * as bing from './integrations/bing.js';
import * as claude from './integrations/claude.js';
import * as performance from './agents/performanceAnalyzer.js';
import * as keywordIntel from './agents/keywordIntelligence.js';
import * as technical from './agents/technicalAuditor.js';
import * as content from './agents/contentOptimizer.js';
import * as competitors from './agents/competitorAnalysis.js';
import { listPages, getPage, rollbackPage, setPageStatus, currentData } from './pages.js';
import { listChanges, listExperiments, outcomeStats } from './learning.js';
import { Scheduler } from './scheduler.js';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function createSeoEngine({ getContent, adminAuth, indexHtmlPath, port }) {
  const site = () => loadSite(getContent);
  const template = () => fs.readFileSync(indexHtmlPath, 'utf8');

  function renderPath(path, s = site()) {
    if (path === '/') return prerenderHome(template(), s);
    if (path === '/services') return renderServicesHub(s);
    if (path === '/insights') return renderInsightsIndex(s);
    let m = path.match(/^\/services\/([a-z0-9-]+)$/);
    if (m) return renderServicePage(s, m[1]);
    m = path.match(/^\/projects\/([a-z0-9-]+)$/);
    if (m) return renderProjectPage(s, m[1]);
    m = path.match(/^\/insights\/([a-z0-9-]+)$/);
    if (m) return renderArticle(s, m[1], { validPaths: validPaths(s) });
    return null;
  }

  function validPaths(s = site()) {
    const set = new Set(publicPaths(s));
    // Project pages that exist but are noindex are still valid link targets.
    for (const p of s.projects || []) set.add(`/projects/${projectSlug(p.id)}`);
    return set;
  }

  function sendHtml(req, res, path, html) {
    analytics.recordRequest(req, path);
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html);
  }

  // ---------------- public routes ----------------
  function mountEarly(app) {
    const { origin, nodeEnv } = config();
    const apexHost = new URL(origin).hostname;
    // One canonical host: www -> apex (301), production only.
    app.use((req, res, next) => {
      if (nodeEnv === 'production' && req.hostname === `www.${apexHost}`) {
        res.redirect(301, `${origin}${req.originalUrl}`);
        return;
      }
      next();
    });
    app.get('/index.html', (_req, res) => res.redirect(301, '/'));
  }

  function mountPublic(app) {
    app.get('/', (req, res, next) => {
      try { sendHtml(req, res, '/', renderPath('/')); } catch (err) { next(err); }
    });
    app.get('/services', (req, res) => sendHtml(req, res, '/services', renderPath('/services')));
    app.get('/services/:slug', (req, res, next) => {
      const html = renderPath(`/services/${req.params.slug}`);
      if (!html) return next();
      sendHtml(req, res, `/services/${req.params.slug}`, html);
    });
    app.get('/projects/:slug', (req, res, next) => {
      const html = renderPath(`/projects/${req.params.slug}`);
      if (!html) return next();
      sendHtml(req, res, `/projects/${req.params.slug}`, html);
    });
    app.get('/insights', (req, res, next) => {
      const html = renderPath('/insights');
      if (!html) return next();
      sendHtml(req, res, '/insights', html);
    });
    app.get('/insights/:slug', (req, res, next) => {
      const html = renderPath(`/insights/${req.params.slug}`);
      if (!html) return next();
      sendHtml(req, res, `/insights/${req.params.slug}`, html);
    });
    app.get('/robots.txt', (_req, res) => res.type('text/plain').send(robotsTxt()));
    app.get('/sitemap.xml', (_req, res) => res.type('application/xml').send(sitemapXml(site())));
    app.get('/llms.txt', (_req, res) => res.type('text/plain').send(llmsTxt(site())));
    app.get('/:key.txt', (req, res, next) => {
      if (req.params.key !== indexnow.getKey()) return next();
      res.type('text/plain').send(indexnow.getKey());
    });
  }

  function mountNotFound(app) {
    app.use((req, res) => {
      if (req.path.startsWith('/api/')) { res.status(404).json({ error: 'Not found.' }); return; }
      if (req.accepts('html')) { res.status(404).type('html').send(renderNotFound(site())); return; }
      res.status(404).send('Not found.');
    });
  }

  // ---------------- admin API ----------------
  function mountAdmin(app) {
    const admin = adminAuth.requireAdmin;
    app.get('/api/admin/seo/status', admin, (_req, res) => {
      const cfg = config();
      const q = indexnow.queue();
      res.json({
        config: { origin: cfg.origin, schedulerEnabled: cfg.schedulerEnabled, autopublish: cfg.autopublish, maxArticlesPerMonth: cfg.maxArticlesPerMonth, llmModel: cfg.llmModel, llmMonthlyBudgetUsd: cfg.llmMonthlyBudgetUsd, indexNowEnabled: cfg.indexNowEnabled },
        integrations: {
          googleSearchConsole: gsc.isConfigured() ? 'configured' : 'missing GSC_SERVICE_ACCOUNT_JSON',
          bingWebmaster: bing.isConfigured() ? 'configured' : 'missing BING_WEBMASTER_API_KEY',
          indexNow: { enabled: cfg.indexNowEnabled, keyFile: `/${indexnow.getKey()}.txt`, pending: q.pending.length, lastSubmitAt: q.lastSubmitAt, lastOutcome: q.lastOutcome || null },
          claude: claude.isConfigured() ? 'configured' : 'missing ANTHROPIC_API_KEY',
          llmSpendThisMonthUsd: Number(claude.monthSpendUsd().toFixed(4)),
          competitors: competitors.competitorList().length
        },
        sitemapSubmission: readJson('sitemap-submission.json', null),
        jobs: engine.scheduler ? engine.scheduler.describe() : [],
        alerts: readJsonl('jobs/alerts.jsonl', { limit: 10 }).reverse(),
        publicUrls: publicPaths(site()),
        analytics: analytics.summary({ days: 28 }),
        learning: outcomeStats()
      });
    });
    app.post('/api/admin/seo/jobs/:name/run', admin, async (req, res) => {
      if (!engine.scheduler?.jobs.has(req.params.name)) { res.status(404).json({ error: 'Unknown job.' }); return; }
      res.json(await engine.scheduler.runJob(req.params.name, { trigger: 'admin' }));
    });
    app.get('/api/admin/seo/changes', admin, (req, res) => res.json({ changes: listChanges({ limit: Math.min(Number(req.query.limit) || 100, 500) }) }));
    app.get('/api/admin/seo/experiments', admin, (_req, res) => res.json({ experiments: listExperiments(), stats: outcomeStats() }));
    app.get('/api/admin/seo/pages', admin, (_req, res) => res.json({ pages: listPages().map((p) => ({ id: p.id, kind: p.kind, status: p.status, currentVersion: p.currentVersion, versions: p.versions.map((v) => ({ v: v.v, at: v.at, by: v.by, reason: v.reason })), updatedAt: p.updatedAt, title: currentData(p)?.title || null })) }));
    app.get('/api/admin/seo/pages/:id', admin, (req, res) => {
      const p = getPage(req.params.id);
      if (!p) { res.status(404).json({ error: 'Not found.' }); return; }
      res.json(p);
    });
    app.post('/api/admin/seo/pages/:id/rollback', admin, (req, res) => {
      const p = rollbackPage(req.params.id, req.body?.version, { by: 'admin', reason: String(req.body?.reason || 'manual rollback').slice(0, 200) });
      if (!p) { res.status(404).json({ error: 'Page or version not found.' }); return; }
      res.json({ ok: true, currentVersion: p.currentVersion });
    });
    app.post('/api/admin/seo/pages/:id/status', admin, (req, res) => {
      const status = req.body?.status;
      if (!['published', 'draft', 'archived'].includes(status)) { res.status(400).json({ error: 'Invalid status.' }); return; }
      const p = getPage(req.params.id);
      if (!p) { res.status(404).json({ error: 'Not found.' }); return; }
      const gate = currentData(p)?.gate;
      if (status === 'published' && p.kind === 'article' && !gate?.passed) {
        res.status(409).json({ error: 'This draft failed the quality gate and cannot be published.', failures: gate?.failures || [] });
        return;
      }
      res.json(setPageStatus(req.params.id, status, { by: 'admin', reason: String(req.body?.reason || '').slice(0, 200) }));
    });
    app.get('/api/admin/seo/preview/insights/:slug', admin, (req, res) => {
      const html = renderArticle(site(), req.params.slug, { validPaths: validPaths(), preview: true });
      if (!html) { res.status(404).json({ error: 'Not found.' }); return; }
      res.type('html').send(html);
    });
    app.get('/api/admin/seo/reports/:name', admin, (req, res) => {
      const files = { technical: 'reports/technical-latest.json', performance: 'reports/performance-latest.json', keywords: 'reports/keywords-latest.json', competitors: 'reports/competitors-latest.json', weekly: 'reports/weekly-latest.json', bing: 'bing/latest.json' };
      const f = files[req.params.name];
      if (!f) { res.status(404).json({ error: 'Unknown report.' }); return; }
      res.json(readJson(f, { status: 'not-generated-yet' }));
    });
  }

  // ---------------- jobs ----------------
  const notConfigured = (cond, msg) => () => (cond() ? null : msg);
  const jobs = [
    {
      name: 'url-state', description: 'Detect new/changed/removed pages, update sitemap lastmod, notify IndexNow', intervalMs: 30 * 60_000, timeoutMs: 120_000,
      run: async () => {
        const s = site();
        const diff = refreshUrlState(s, (p) => renderPath(p, s));
        const { origin } = config();
        const urls = [...diff.added, ...diff.changed, ...diff.removed].map((p) => origin + p);
        if (urls.length) indexnow.enqueue(urls);
        if (diff.added.length || diff.removed.length) writeJson('sitemap-dirty.json', { at: new Date().toISOString(), added: diff.added, removed: diff.removed });
        const submit = await indexnow.flush();
        return { added: diff.added, changed: diff.changed, removed: diff.removed, indexnow: submit };
      }
    },
    {
      name: 'sitemap-submit', description: 'Submit sitemap to Google Search Console and Bing when the URL set changes', intervalMs: DAY, timeoutMs: 120_000,
      requires: notConfigured(() => gsc.isConfigured() || bing.isConfigured(), 'Neither Search Console nor Bing credentials are configured'),
      run: async () => {
        const { origin } = config();
        const feed = `${origin}/sitemap.xml`;
        const prev = readJson('sitemap-submission.json', {});
        const dirty = readJson('sitemap-dirty.json', null);
        const needs = !prev.lastSubmittedAt || (dirty && dirty.at > prev.lastSubmittedAt);
        const out = { ...prev, checkedAt: new Date().toISOString() };
        if (gsc.isConfigured()) {
          if (needs) out.google = { ...(await gsc.submitSitemap(feed)), at: new Date().toISOString() };
          try { out.googleStatus = await gsc.listSitemaps(); } catch (err) { out.googleStatusError = err.message; }
        }
        if (bing.isConfigured() && needs) {
          try { await bing.submitFeed(feed); out.bing = { ok: true, at: new Date().toISOString() }; } catch (err) { out.bing = { ok: false, error: err.message, at: new Date().toISOString() }; }
        }
        if (needs) out.lastSubmittedAt = new Date().toISOString();
        writeJson('sitemap-submission.json', out);
        return { submitted: needs, google: out.google || null, bing: out.bing || null };
      }
    },
    {
      name: 'gsc-sync', description: 'Store daily Search Console performance (page x query, device, country)', intervalMs: DAY, timeoutMs: 600_000,
      requires: notConfigured(gsc.isConfigured, 'GSC_SERVICE_ACCOUNT_JSON not set'),
      run: () => gsc.syncSearchAnalytics()
    },
    {
      name: 'gsc-inspection', description: 'URL Inspection: real indexing status of every public URL', intervalMs: 7 * DAY, timeoutMs: 600_000,
      requires: notConfigured(gsc.isConfigured, 'GSC_SERVICE_ACCOUNT_JSON not set'),
      run: async () => {
        const { origin } = config();
        const r = await gsc.inspectUrls(publicPaths(site()).map((p) => origin + p));
        const verdicts = Object.values(r).reduce((m, x) => ({ ...m, [x.verdict || (x.error ? 'ERROR' : 'UNKNOWN')]: (m[x.verdict || (x.error ? 'ERROR' : 'UNKNOWN')] || 0) + 1 }), {});
        return { inspected: Object.keys(r).length, verdicts };
      }
    },
    {
      name: 'bing-sync', description: 'Store Bing Webmaster page/query stats, crawl issues and quota', intervalMs: DAY, timeoutMs: 300_000,
      requires: notConfigured(bing.isConfigured, 'BING_WEBMASTER_API_KEY not set'),
      run: async () => {
        const settle = async (fn) => { try { return { ok: true, data: await fn() }; } catch (err) { return { ok: false, error: err.message }; } };
        const [pages, queries, crawlIssues, quota, feeds] = await Promise.all([settle(bing.getPageStats), settle(bing.getQueryStats), settle(bing.getCrawlIssues), settle(bing.getUrlSubmissionQuota), settle(bing.getFeeds)]);
        const snapshot = { at: new Date().toISOString(), pages, queries, crawlIssues, quota, feeds };
        writeJson(`bing/daily/${today()}.json`, snapshot);
        writeJson('bing/latest.json', snapshot);
        const failed = Object.entries({ pages, queries, crawlIssues, quota, feeds }).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.error}`);
        if (failed.length === 5) throw new Error(`All Bing calls failed: ${failed.join('; ')}`);
        return { ok: 5 - failed.length, failed };
      }
    },
    {
      name: 'performance-analysis', description: 'Analyze GSC history: low CTR, decliners, risers, striking distance, cannibalization, gaps', intervalMs: DAY, timeoutMs: 120_000,
      run: async () => { const r = performance.analyze(); return { status: r.status, lowCtr: r.findings?.lowCtr?.length || 0, declining: r.findings?.declining?.length || 0, cannibalization: r.findings?.cannibalization?.length || 0, coverageGaps: r.findings?.coverageGaps?.length || 0 }; }
    },
    {
      name: 'keyword-intelligence', description: 'Merge observed GSC/Bing queries into the keyword dataset; discover new queries and questions', intervalMs: 7 * DAY, timeoutMs: 300_000,
      run: async () => { const r = await keywordIntel.run(); return { total: r.total, discovered: r.discovered.length, gscDays: r.gscDays }; }
    },
    {
      name: 'technical-audit', description: 'Crawl own public URLs and check status, metadata, canonicals, structured data, links', intervalMs: DAY, timeoutMs: 300_000,
      run: async () => {
        const s = site();
        const lastExternal = readJson('reports/external-check.json', {}).at;
        const checkExternal = !lastExternal || Date.now() - Date.parse(lastExternal) > 7 * DAY;
        const externalLinks = (s.projects || []).flatMap((p) => [p.link, p.github]).filter(Boolean);
        const r = await technical.audit({ baseUrl: `http://127.0.0.1:${port}`, paths: publicPaths(s), checkExternal, externalLinks });
        if (checkExternal) writeJson('reports/external-check.json', { at: new Date().toISOString() });
        return { pagesChecked: r.pagesChecked, errors: r.errors, warnings: r.warnings };
      }
    },
    {
      name: 'experiment-evaluation', description: 'Evaluate running title experiments; keep winners, roll back losers', intervalMs: DAY, timeoutMs: 120_000,
      run: async () => ({ results: await content.evaluateExperiments() })
    },
    {
      name: 'content-agent', description: 'Title experiments and evidence-gated articles from observed demand', intervalMs: 7 * DAY, timeoutMs: 900_000,
      requires: notConfigured(claude.isConfigured, 'ANTHROPIC_API_KEY not set'),
      run: async () => {
        const s = site();
        const r = await content.run({ getContent, validPaths: validPaths(s), performance: readJson('reports/performance-latest.json', null), keywords: keywordIntel.dataset() });
        return { experiments: r.experiments, article: r.article && { status: r.article.status, pageId: r.article.pageId, reason: r.article.reason, failures: r.article.gate?.failures?.length } };
      }
    },
    {
      name: 'competitor-analysis', description: 'Content gaps vs owner-listed competitors (robots-permitted sitemaps only)', intervalMs: 30 * DAY, timeoutMs: 300_000,
      requires: notConfigured(() => competitors.competitorList().length > 0, 'SEO_COMPETITOR_URLS not set'),
      run: async () => { const ds = keywordIntel.dataset(); const r = await competitors.run({ ourKeywords: ds.keywords.map((k) => k.keyword) }); return { competitors: r.competitors?.length || 0, gaps: r.gaps?.length || 0 }; }
    },
    {
      name: 'weekly-report', description: 'Weekly summary: search performance, AI referrals, indexing, changes, experiments', intervalMs: 7 * DAY, timeoutMs: 60_000,
      run: async () => {
        const r = weeklyReport();
        writeJson('reports/weekly-latest.json', r);
        writeJson(`reports/weekly/${today()}.json`, r);
        return { aiReferrals: r.traffic.aiReferrals, conversions: r.traffic.conversions };
      }
    }
  ];

  function weeklyReport() {
    const perf = readJson('reports/performance-latest.json', null);
    const tech = readJson('reports/technical-latest.json', null);
    const inspection = readJson('gsc/inspection.json', {});
    const state = urlState();
    const { origin } = config();
    const urls = publicPaths(site()).map((p) => {
      const insp = inspection[origin + p] || {};
      // Each stage is reported only when there is evidence for it.
      return {
        url: origin + p,
        discovered: Boolean(state[p]),
        submittedViaIndexNow: readJsonl('history/indexnow.jsonl').some((e) => e.urls?.includes(origin + p) && ['received', 'received-key-pending'].includes(e.outcome)),
        inSitemap: true,
        crawled: Boolean(insp.lastCrawlTime),
        indexed: insp.verdict === 'PASS' ? true : insp.verdict ? false : null,
        coverageState: insp.coverageState || null,
        receivingImpressions: Boolean(perf?.findings && Object.keys(perf.findings).length && (readJsonl('history/performance-snapshots.jsonl', { limit: 1 })[0]?.pages?.[p]?.i > 0))
      };
    });
    return {
      at: new Date().toISOString(),
      search: perf ? { window: perf.window, totals: perf.findings?.totals, lowCtr: perf.findings?.lowCtr?.slice(0, 5), declining: perf.findings?.declining, strikingDistance: perf.findings?.strikingDistance?.slice(0, 10) } : null,
      technical: tech ? { errors: tech.errors, warnings: tech.warnings, issues: tech.issues.slice(0, 20) } : null,
      traffic: analytics.summary({ days: 7 }),
      indexingPipeline: urls,
      changes: listChanges({ limit: 50 }).filter((c) => Date.now() - Date.parse(c.at) < 7 * DAY),
      experiments: listExperiments().slice(-10),
      learning: outcomeStats(),
      llmSpendThisMonthUsd: claude.monthSpendUsd()
    };
  }

  const engine = {
    scheduler: null,
    jobs,
    mountEarly,
    mountPublic,
    mountAdmin,
    mountNotFound,
    renderPath,
    validPaths,
    weeklyReport,
    recordConversion: (attribution, ownHost) => analytics.recordConversion({ attribution, ownHost }),
    startScheduler() {
      const cfg = config();
      engine.scheduler = new Scheduler({ jobs, tickMs: cfg.schedulerTickMs });
      if (cfg.schedulerEnabled) engine.scheduler.start();
      else console.log('[seo-scheduler] disabled (set SEO_SCHEDULER_ENABLED=true to enable outside production)');
      return engine.scheduler;
    }
  };
  return engine;
}

export { SERVICES };
