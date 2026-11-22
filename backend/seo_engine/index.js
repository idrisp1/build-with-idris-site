// SEO & AI-discovery engine: wires rendering, measurement, integrations,
// agents and the scheduler into the EXISTING Express app (server.js). Nothing
// here replaces existing features: admin editing, content API, uploads,
// messages, reviews and the Search Insights panel are untouched.
import fs from 'node:fs';
import { config, BACKEND_DIR } from './config.js';
import path from 'node:path';
import { readJson, writeJson, readJsonl, appendJsonl, today } from './store.js';
import { loadSite } from './evidence.js';
import { SERVICES } from './catalog.js';
import { prerenderHome } from './render/home.js';
import { renderServicesHub, renderServicePage, renderProjectPage, renderInsightsIndex, renderArticle, renderNotFound, projectSlug } from './render/pages.js';
import { publicPaths, refreshUrlState, sitemapXml, robotsTxt, llmsTxt, urlState, shouldSubmitSitemap } from './render/discovery.js';
import * as analytics from './analytics.js';
import * as indexnow from './integrations/indexnow.js';
import * as gsc from './integrations/gsc.js';
import * as bing from './integrations/bing.js';
import * as performance from './agents/performanceAnalyzer.js';
import * as keywordIntel from './agents/keywordIntelligence.js';
import * as technical from './agents/technicalAuditor.js';
import * as content from './agents/contentOptimizer.js';
import * as competitors from './agents/competitorAnalysis.js';
import * as autoFixer from './agents/autoFixer.js';
import * as studio from './agents/articleStudio.js';
import { loadVocab } from './agents/schemaValidator.js';
import * as googleOAuth from './integrations/googleOAuth.js';
import * as pagespeed from './integrations/pagespeed.js';
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
        config: { origin: cfg.origin, schedulerEnabled: cfg.schedulerEnabled, indexNowEnabled: cfg.indexNowEnabled, contentMode: 'deterministic (no LLM)' },
        integrations: {
          googleSearchConsole: gsc.isConfigured() ? `configured (${gsc.authMode()})` : 'missing GSC_SERVICE_ACCOUNT_JSON or Google OAuth',
          googleOAuth: googleOAuth.status(),
          pageSpeedApiKey: Boolean(process.env.PAGESPEED_API_KEY),
          bingWebmaster: bing.isConfigured() ? 'configured' : 'missing BING_WEBMASTER_API_KEY',
          indexNow: { enabled: cfg.indexNowEnabled, keyFile: `/${indexnow.getKey()}.txt`, pending: q.pending.length, lastSubmitAt: q.lastSubmitAt, lastOutcome: q.lastOutcome || null },
          researchBriefs: content.listBriefs().length,
          competitors: competitors.competitorList().length
        },
        sitemapSubmission: readJson('sitemap-submission.json', null),
        jobs: engine.scheduler ? engine.scheduler.describe() : [],
        alerts: readJsonl('jobs/alerts.jsonl', { limit: 10 }).reverse(),
        publicUrls: publicPaths(site()),
        analytics: analytics.summary({ days: 28 }),
        learning: outcomeStats(),
        autofix: readJson('reports/autofix-latest.json', null),
        coreWebVitals: readJson('reports/cwv-latest.json', null),
        services: SERVICES.map((sv) => ({ slug: sv.slug, name: sv.name }))
      });
    });
    // ---- Google OAuth (optional alternative to the service account) ----
    app.get('/api/admin/seo/google/oauth/start', admin, (_req, res) => {
      try { res.redirect(googleOAuth.startUrl()); } catch (err) { res.status(409).json({ error: err.message }); }
    });
    app.get('/api/admin/seo/google/oauth/callback', admin, async (req, res) => {
      if (!googleOAuth.consumeState(String(req.query.state || ''))) { res.status(400).send('Invalid or expired OAuth state. Start the connection again from the SEO Engine panel.'); return; }
      if (req.query.error) { res.status(400).send(`Google returned: ${String(req.query.error).slice(0, 100)}`); return; }
      try {
        await googleOAuth.exchangeCode(String(req.query.code || ''));
        res.redirect('/?seo=google-connected');
      } catch (err) { res.status(502).send(`Could not complete the Google connection: ${String(err.message).slice(0, 200)}`); }
    });
    app.post('/api/admin/seo/google/oauth/disconnect', admin, async (_req, res) => res.json(await googleOAuth.disconnect()));
    app.post('/api/admin/seo/jobs/:name/run', admin, async (req, res) => {
      if (!engine.scheduler?.jobs.has(req.params.name)) { res.status(404).json({ error: 'Unknown job.' }); return; }
      res.json(await engine.scheduler.runJob(req.params.name, { trigger: 'admin' }));
    });
    app.get('/api/admin/seo/changes', admin, (req, res) => res.json({ changes: listChanges({ limit: Math.min(Number(req.query.limit) || 100, 500) }) }));
    app.get('/api/admin/seo/briefs', admin, (_req, res) => res.json({ briefs: content.listBriefs() }));
    // ---- Article studio (owner-written articles) ----
    app.post('/api/admin/seo/articles/check', admin, (req, res) => {
      const body = req.body || {};
      if (!body.article || typeof body.article !== 'object') { res.status(400).json({ error: 'article is required' }); return; }
      const r = studio.checkOwnerArticle(body.article, { site: site(), validPaths: validPaths(), figuresConfirmed: body.figuresConfirmed, slug: body.slug });
      res.json({ slug: r.slug, gate: r.gate, preview: r.article });
    });
    app.post('/api/admin/seo/articles', admin, async (req, res) => {
      const body = req.body || {};
      if (!body.article || typeof body.article !== 'object') { res.status(400).json({ error: 'article is required' }); return; }
      const r = studio.saveOwnerArticle(body.article, { site: site(), validPaths: validPaths(), publish: body.publish === true, figuresConfirmed: body.figuresConfirmed === true, briefId: body.briefId ? String(body.briefId).replace(/[^a-z0-9-]/g, '') : null });
      if (r.published && engine.scheduler) {
        // Put it in the sitemap and notify search engines right away (don't wait for the 30-min cycle).
        engine.scheduler.runJob('url-state', { trigger: 'article-published' }).catch(() => {});
      }
      res.status(r.error ? 409 : 200).json(r);
    });
    app.get('/api/admin/seo/articles/:slug', admin, (req, res) => {
      const a = studio.loadArticleForEditing(req.params.slug);
      if (!a) { res.status(404).json({ error: 'Not found.' }); return; }
      res.json(a);
    });
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
      const files = { technical: 'reports/technical-latest.json', performance: 'reports/performance-latest.json', keywords: 'reports/keywords-latest.json', competitors: 'reports/competitors-latest.json', weekly: 'reports/weekly-latest.json', bing: 'bing/latest.json', 'bing-urls': 'bing/url-info.json', autofix: 'reports/autofix-latest.json', cwv: 'reports/cwv-latest.json', inspection: 'gsc/inspection.json', sitemaps: 'sitemap-submission.json', 'article-pack': 'reports/article-pack-latest.json' };
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
        // Fallback: if IndexNow rejected or couldn't reach the endpoint, submit the
        // same URLs through Bing's own URL Submission API (within Bing's daily quota).
        let bingFallback = null;
        if (['rejected', 'error'].includes(submit.status) && bing.isConfigured()) {
          const pending = urls.length ? urls : publicPaths(s).map((p) => origin + p);
          try { bingFallback = await bing.submitWithinQuota(pending); } catch (err) { bingFallback = { error: err.message }; }
          appendJsonl('history/bing-url-submissions.jsonl', { at: new Date().toISOString(), trigger: `indexnow-${submit.status}`, urls: pending.length, result: bingFallback });
        }
        return { added: diff.added, changed: diff.changed, removed: diff.removed, indexnow: submit, bingFallback };
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
        // Each engine is tracked separately; a failed submission is retried on the
        // next run (e.g. after the owner fixes a permission), never marked done.
        const needsFor = (last) => shouldSubmitSitemap(last, dirty);
        const out = { ...prev, checkedAt: new Date().toISOString() };
        const submitted = [];
        if (gsc.isConfigured()) {
          if (needsFor(prev.google)) { out.google = { ...(await gsc.submitSitemap(feed)), at: new Date().toISOString() }; submitted.push('google'); }
          try { out.googleStatus = await gsc.listSitemaps(); } catch (err) { out.googleStatusError = err.message; }
        }
        if (bing.isConfigured() && needsFor(prev.bing)) {
          try { await bing.submitFeed(feed); out.bing = { ok: true, at: new Date().toISOString() }; } catch (err) { out.bing = { ok: false, error: err.message, at: new Date().toISOString() }; }
          submitted.push('bing');
        }
        writeJson('sitemap-submission.json', out);
        return { submitted, google: out.google || null, bing: out.bing || null, googleSitemaps: (out.googleStatus || []).map((s) => ({ path: s.path, lastSubmitted: s.lastSubmitted, lastDownloaded: s.lastDownloaded, isPending: s.isPending, errors: s.errors, warnings: s.warnings })) };
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
      run: async () => { const r = await keywordIntel.run(); return { total: r.total, discovered: r.discovered.length, gscDays: r.gscDays, measuredDemand: r.measuredDemand, bingVolumeKeywords: r.bingVolumes.keywords }; }
    },
    {
      name: 'technical-audit', description: 'Crawl own public URLs and check status, metadata, canonicals, structured data, links', intervalMs: DAY, timeoutMs: 300_000,
      run: async () => {
        const s = site();
        const lastExternal = readJson('reports/external-check.json', {}).at;
        const checkExternal = !lastExternal || Date.now() - Date.parse(lastExternal) > 7 * DAY;
        const externalLinks = (s.projects || []).flatMap((p) => [p.link, p.github]).filter(Boolean);
        let vocab = null;
        try { vocab = await loadVocab(); } catch (err) { appendJsonl('history/errors.jsonl', { at: new Date().toISOString(), job: 'technical-audit', source: 'schema-vocab', error: err.message }); }
        const paths = publicPaths(s);
        const r = await technical.audit({ baseUrl: `http://127.0.0.1:${port}`, paths, checkExternal, externalLinks, vocab });
        if (checkExternal) writeJson('reports/external-check.json', { at: new Date().toISOString() });
        // Automatic, verified fixes for what can be fixed safely; the rest is reported for the owner.
        const plans = autoFixer.planFixes({ issues: r.issues, site: s, pages: r.pages });
        const fixes = autoFixer.applyFixes({ plans, renderPath: (p) => renderPath(p, site()) });
        const ownerActions = [
          ...r.issues.filter((i) => i.check === 'broken-external-link').map((i) => ({ url: i.path, problem: autoFixer.classifyExternal(i), detail: i.detail })),
          // Which service a project proves is a judgment call, so link gaps are reported, not guessed.
          ...r.issues.filter((i) => i.check === 'orphan-page' || i.check === 'missing-contextual-link').map((i) => ({ url: i.path, problem: i.check, detail: i.detail }))
        ];
        let after = r;
        if (fixes.some((f) => f.status === 'fixed-and-verified')) {
          after = await technical.audit({ baseUrl: `http://127.0.0.1:${port}`, paths, vocab }); // verify on the running server
        }
        writeJson('reports/autofix-latest.json', { at: new Date().toISOString(), fixes, ownerActions, errorsBefore: r.errors, warningsBefore: r.warnings, errorsAfter: after.errors, warningsAfter: after.warnings });
        return { pagesChecked: r.pagesChecked, errors: after.errors, warnings: after.warnings, schemaValidated: r.schemaValidated, fixed: fixes.filter((f) => f.status === 'fixed-and-verified').length, rolledBack: fixes.filter((f) => f.status === 'rolled-back').length, ownerActions: ownerActions.length };
      }
    },
    {
      name: 'experiment-evaluation', description: 'Evaluate running title experiments; keep winners, roll back losers', intervalMs: DAY, timeoutMs: 120_000,
      run: async () => ({ results: await content.evaluateExperiments() })
    },
    {
      name: 'content-agent', description: 'Deterministic title experiments + research briefs from observed demand (no LLM)', intervalMs: 7 * DAY, timeoutMs: 300_000,
      run: async () => {
        const r = await content.run({ getContent, performance: readJson('reports/performance-latest.json', null), keywords: keywordIntel.dataset() });
        return { experiments: r.experiments, briefs: r.briefs };
      }
    },
    {
      name: 'core-web-vitals', description: 'PageSpeed Insights lab + real-user (CrUX) Core Web Vitals for key pages', intervalMs: 7 * DAY, timeoutMs: 600_000,
      requires: () => (config().nodeEnv === 'production' || process.env.SEO_CWV_ENABLED === 'true' ? null : 'measures the public site; production only'),
      run: async () => {
        const { origin } = config();
        const s = site();
        const urls = [`${origin}/`, `${origin}/services`, ...['website-design-development', 'ai-development'].map((x) => `${origin}/services/${x}`), ...(s.projects || []).filter((p) => p.featured).slice(0, 1).map((p) => `${origin}/projects/${projectSlug(p.id)}`)];
        return pagespeed.run(urls);
      }
    },
    {
      name: 'bing-url-status', description: 'Bing URL-level index status (GetUrlInfo) for every public page', intervalMs: 7 * DAY, timeoutMs: 300_000,
      requires: notConfigured(bing.isConfigured, 'BING_WEBMASTER_API_KEY not set'),
      run: async () => {
        const { origin } = config();
        const out = {};
        for (const p of publicPaths(site())) {
          try { out[origin + p] = { checkedAt: new Date().toISOString(), ...(await bing.getUrlInfo(origin + p)) }; } catch (err) { out[origin + p] = { checkedAt: new Date().toISOString(), error: err.message }; }
        }
        writeJson('bing/url-info.json', out);
        return { checked: Object.keys(out).length, errors: Object.values(out).filter((x) => x.error).length };
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
    const bingInfo = readJson('bing/url-info.json', {});
    const indexNowLog = readJsonl('history/indexnow.jsonl');
    const lastSnapshot = readJsonl('history/performance-snapshots.jsonl', { limit: 1 })[0];
    const urls = publicPaths(site()).map((p) => {
      const insp = inspection[origin + p] || {};
      const b = bingInfo[origin + p] || {};
      // Each stage is reported only when there is evidence for it (null = unknown).
      return {
        url: origin + p,
        discovered: Boolean(state[p]),
        inSitemap: true,
        submittedViaIndexNow: indexNowLog.some((e) => e.urls?.includes(origin + p) && ['received', 'received-key-pending'].includes(e.outcome)),
        google: {
          crawled: insp.lastCrawlTime ? true : insp.verdict ? false : null,
          indexed: insp.verdict === 'PASS' ? true : insp.verdict ? false : null,
          coverageState: insp.coverageState || null,
          receivingImpressions: lastSnapshot ? (lastSnapshot.pages?.[p]?.i || 0) > 0 : null,
          receivingClicks: lastSnapshot ? (lastSnapshot.pages?.[p]?.c || 0) > 0 : null
        },
        bing: b.error || !Object.keys(b).length ? null : { crawled: Boolean(b.LastCrawledDate && !String(b.LastCrawledDate).startsWith('0001')), httpStatus: b.HttpStatus ?? null, discovered: b.DiscoveryDate || null }
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
      researchBriefs: content.listBriefs().slice(0, 10).map((b) => ({ id: b.id, keyword: b.keyword, service: b.targetService, createdAt: b.createdAt })),
      autofix: readJson('reports/autofix-latest.json', null),
      coreWebVitals: readJson('reports/cwv-latest.json', null)
    };
  }

  // Article pack: owner-approved articles shipped in the repo
  // (seo_engine/content/article-pack.json). Each one goes through exactly the
  // same quality gate as the admin article editor; anything that already exists
  // is left alone, so restarts and redeploys never duplicate or overwrite.
  function importArticlePack(file = process.env.SEO_ARTICLE_PACK || path.join(BACKEND_DIR, 'seo_engine', 'content', 'article-pack.json')) {
    if (file === 'off' || !fs.existsSync(file)) return null;
    const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
    const results = [];
    for (const item of pack.articles || []) {
      const slug = studio.slugify(item.slug);
      if (getPage(`article:${slug}`)) { results.push({ slug, status: 'already exists (left unchanged)' }); continue; }
      const r = studio.saveOwnerArticle({ ...item, slug }, { site: site(), validPaths: validPaths(), publish: true });
      results.push({ slug: r.slug, status: r.status, failures: r.gate.passed ? undefined : r.gate.failures });
    }
    const report = { at: new Date().toISOString(), pack: pack.name || path.basename(file), published: results.filter((r) => r.status === 'published').length, results };
    writeJson('reports/article-pack-latest.json', report);
    if (report.published && engine.scheduler) engine.scheduler.runJob('url-state', { trigger: 'article-pack' }).catch(() => {});
    return report;
  }

  const engine = {
    scheduler: null,
    importArticlePack,
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
      try {
        const r = importArticlePack();
        if (r) console.log(`[seo-article-pack] ${r.published} published, ${r.results.length - r.published} skipped or held`);
      } catch (err) { console.error('[seo-article-pack] import failed:', err.message); }
      return engine.scheduler;
    }
  };
  return engine;
}

export { SERVICES };
