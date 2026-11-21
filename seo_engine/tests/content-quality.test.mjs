// Quality gate, deterministic content agent (title experiments + research
// briefs, no LLM), experiment evaluation and performance analysis.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useDataDir, writeGscDay, isoDay, BACKEND } from './helpers.mjs';

const gate = await import('../../backend/seo_engine/agents/qualityGate.js');
const { loadSite, evidenceFacts } = await import('../../backend/seo_engine/evidence.js');
const content = await import('../../backend/seo_engine/agents/contentOptimizer.js');
const pages = await import('../../backend/seo_engine/pages.js');
const learning = await import('../../backend/seo_engine/learning.js');
const perf = await import('../../backend/seo_engine/agents/performanceAnalyzer.js');
const { getContent } = await import('../../backend/lib/contentStore.js');

const site = loadSite(getContent);
const facts = evidenceFacts(site);
const evidenceIds = new Set(facts.map((f) => f.id));
const validPaths = new Set(['/', '/services', '/services/ai-automation', '/services/website-design-development', '/projects/cadens']);

beforeEach(() => {
  useDataDir();
  process.env.FRONTEND_ORIGIN = 'https://buildwithidris.com';
});

function paragraph(topic, i) {
  return `When a small business looks at ${topic}, the first step is to write down each manual task in the order it happens today, who does it, and what information moves between tools. Step ${i} is about deciding which part is predictable enough to hand to software, and which part still needs a person to look at it before anything is sent to a customer. Doing this on paper first keeps the automation honest and makes it obvious where errors would come from.`;
}

function goodArticle(overrides = {}) {
  const cadens = facts.find((f) => f.id === 'project.cadens');
  return {
    title: 'How a Small Business Can Automate Reminder Messages',
    metaDescription: 'A practical guide to automating appointment reminders and follow-ups for a small business, with what to check before you switch it on.',
    h1: 'How a small business can automate reminder messages',
    slug: 'automate-reminder-messages',
    primaryKeyword: 'automate appointment reminders sms',
    secondaryKeywords: ['reminder automation'],
    serviceSlug: 'ai-automation',
    summary: 'What to automate first, what to keep human, and how to test it.',
    sections: [
      { heading: 'Start with the workflow you already have', paragraphs: [paragraph('reminders', 1), paragraph('follow-ups', 2)], bullets: [] },
      { heading: 'Choose the trigger', paragraphs: [paragraph('triggers', 3), paragraph('calendars', 4)], bullets: ['A new booking', 'A changed appointment'] },
      { heading: 'Keep a person in the loop', paragraphs: [paragraph('reviews', 5), `I built SMS and email workflows with Twilio for a behavioral health provider; see the [automation service](/services/ai-automation).`], bullets: [] },
      { heading: 'Test before you rely on it', paragraphs: [paragraph('testing', 6), paragraph('monitoring', 7)], bullets: [] },
      { heading: 'Review it every month', paragraphs: [paragraph('monthly reviews', 8), paragraph('exceptions', 9)], bullets: [] }
    ],
    faqs: [{ q: 'Will automated reminders replace my front desk?', a: 'No. They remove the repetitive sending, while people keep handling conversations and exceptions.' }],
    relatedProjects: ['cadens'],
    claims: [{ text: 'Built SMS and email workflows with Twilio for a behavioral health provider', evidenceIds: [cadens ? 'project.cadens' : 'service.ai-automation'] }],
    ...overrides
  };
}

const ctx = (extra = {}) => ({ site, evidenceIds, articles: [], validPaths, factCheck: { unsupported: [] }, ...extra });

test('a well-formed, evidence-backed article passes every gate check', () => {
  const r = gate.checkArticle(goodArticle(), ctx());
  assert.deepEqual(r.failures, []);
  assert.ok(r.words >= 450);
});

test('gate rejects prices, guarantees and invented figures', () => {
  const a = goodArticle();
  a.sections[0].paragraphs.push('Most of my clients save $500 a month and I guarantee results; reminders cut no-shows by 73%.');
  const r = gate.checkArticle(a, ctx());
  const checks = r.failures.map((f) => f.detail).join(' | ');
  assert.match(checks, /price/);
  assert.match(checks, /guarantee/);
  assert.match(checks, /73%/);
  assert.equal(r.passed, false);
});

test('figures that ARE in the site evidence are allowed', () => {
  const a = goodArticle();
  a.sections[1].paragraphs.push('In a previous fintech system I designed, an event-driven architecture processed 50,000+ monthly transactions at 99.97% uptime.');
  assert.deepEqual(gate.checkArticle(a, ctx()).failures, []);
});

test('gate rejects keyword cannibalization against existing service pages', () => {
  const r = gate.checkArticle(goodArticle({ primaryKeyword: 'AI automation for small businesses' }), ctx());
  assert.ok(r.failures.some((f) => f.check === 'cannibalization'));
});

test('gate rejects claims without evidence, failed or missing fact-checks, broken links, unknown projects, thin content', () => {
  let r = gate.checkArticle(goodArticle({ claims: [{ text: 'Worked with NASA', evidenceIds: ['made.up'] }] }), ctx());
  assert.ok(r.failures.some((f) => f.check === 'factual-accuracy'));
  r = gate.checkArticle(goodArticle(), ctx({ factCheck: { unsupported: ['I have 200 clients'] } }));
  assert.ok(r.failures.some((f) => f.detail.includes('200 clients')));
  r = gate.checkArticle(goodArticle(), ctx({ factCheck: null }));
  assert.ok(r.failures.some((f) => f.detail.includes('did not run')));
  const a = goodArticle();
  a.sections[0].paragraphs.push('See [pricing](/pricing).');
  r = gate.checkArticle(a, ctx());
  assert.ok(r.failures.some((f) => f.check === 'internal-links'));
  r = gate.checkArticle(goodArticle({ relatedProjects: ['nonexistent'] }), ctx());
  assert.ok(r.failures.some((f) => f.check === 'internal-links'));
  r = gate.checkArticle(goodArticle({ sections: goodArticle().sections.slice(0, 1) }), ctx());
  assert.ok(r.failures.some((f) => f.check === 'depth'));
});

test('gate rejects near-duplicate articles', () => {
  const existing = { id: 'article:other', data: goodArticle({ primaryKeyword: 'reminder workflow design', title: 'Designing Reminder Workflows for Clinics' }) };
  const r = gate.checkArticle(goodArticle(), ctx({ articles: [existing] }));
  assert.ok(r.failures.some((f) => f.check === 'duplication'));
});

// ---------------- deterministic content agent (no LLM) ----------------
const kwWithDemand = [
  { keyword: 'speculative topic', status: 'expansion-opportunity', intent: 'informational', targetService: 'ai-automation', opportunityScore: 90 },
  { keyword: 'wordpress developer', status: 'requires-evidence', intent: 'commercial', targetService: null, measured: { gsc: { impressions90d: 500 } } },
  { keyword: 'what is data annotation', status: 'expansion-opportunity', intent: 'informational/question', targetService: 'ai-data-annotation', opportunityScore: 20, measured: { gsc: { impressions90d: 12 } } }
];

test('brief selection refuses topics without observed demand or outside verified services', () => {
  const picks = content.pickBriefOpportunities(kwWithDemand, { attempted: new Set() });
  assert.deepEqual(picks.map((k) => k.keyword), ['what is data annotation']);
  assert.deepEqual(content.pickBriefOpportunities(kwWithDemand, { attempted: new Set(['what is data annotation']) }), []);
});

test('research brief: built from site evidence only, saved for the owner, never published as a page', async () => {
  const r = await content.run({ getContent, performance: null, keywords: { keywords: kwWithDemand } });
  assert.equal(r.mode, 'deterministic (no LLM)');
  assert.deepEqual(r.briefs.ids, ['what-is-data-annotation']);
  const [brief] = content.listBriefs();
  assert.equal(brief.targetUrl, '/services/ai-data-annotation');
  assert.ok(brief.suggestedOutline.length >= 3);
  const ids = new Set(facts.map((f) => f.id));
  assert.ok(brief.evidenceToUse.length > 0 && brief.evidenceToUse.every((e) => ids.has(e.id)), 'evidence comes only from the site');
  assert.equal(pages.listPages({ kind: 'article' }).length, 0, 'no article page is created');
  const again = await content.run({ getContent, performance: null, keywords: { keywords: kwWithDemand } });
  assert.equal(again.briefs.status, 'none', 'same topic is not briefed twice within 90 days');
});

test('the agent makes no network or AI calls (no Claude client exists anymore)', () => {
  assert.equal(fs.existsSync(path.join(BACKEND, 'seo_engine', 'integrations', 'claude.js')), false);
  const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@anthropic-ai/sdk'], undefined);
});

test('deterministic title: built from a real query that matches the page keywords, passes the meta gate', () => {
  const target = content.pageForPath('/services/website-design-development', site);
  const proposal = content.proposeTitle({ target, queries: [{ query: 'web developer phoenix', impressions: 300 }, { query: 'cheap logo maker', impressions: 900 }], site });
  assert.equal(proposal.title, 'Web Developer Phoenix | Idris Paul Kwaya');
  assert.match(proposal.basis, /search query "web developer phoenix"/);
  assert.equal(gate.checkMeta({ title: proposal.title }, { site }).passed, true);
  // an unrelated query is never used; falls back to the page's own verified keyword
  const fallback = content.proposeTitle({ target, queries: [{ query: 'cheap logo maker', impressions: 900 }], site });
  assert.equal(fallback.title, 'Website Design Phoenix | Idris Paul Kwaya');
  // a title that was already tried is not tried again
  const next = content.proposeTitle({ target, queries: [], site, triedTitles: new Set(['Website Design Phoenix | Idris Paul Kwaya']) });
  assert.notEqual(next.title, 'Website Design Phoenix | Idris Paul Kwaya');
});

test('title experiment starts from performance data, records a baseline, and changes only the title', async () => {
  const dir = process.env.SEO_DATA_DIR;
  for (let d = -30; d <= -1; d += 1) {
    writeGscDay(dir, isoDay(d), [{ page: 'https://buildwithidris.com/services/ai-automation', clicks: 0, impressions: 50, ctr: 0, position: 4 }],
      [{ page: 'https://buildwithidris.com/services/ai-automation', query: 'business process automation services', clicks: 0, impressions: 50, position: 4 }]);
  }
  const performance = { findings: { lowCtr: [{ page: 'https://buildwithidris.com/services/ai-automation', path: '/services/ai-automation', impressions: 1500, clicks: 0, ctr: 0, position: 4 }] } };
  const out = await content.runTitleExperiments({ site, performance });
  assert.equal(out[0].status, 'started', JSON.stringify(out));
  assert.equal(out[0].title, 'Business Process Automation Services | Idris Paul Kwaya');
  const page = pages.getPage('service:ai-automation');
  assert.deepEqual(Object.keys(pages.currentData(page)), ['title'], 'only one variable changed');
  const [exp] = learning.listExperiments();
  assert.equal(exp.baseline.impressions, 28 * 50, 'baseline = the last 28 days of stored data');
  const second = await content.runTitleExperiments({ site, performance });
  assert.equal(second.length, 0, 'no second experiment on a page while one is running');
});

// ---------------- experiments ----------------
function seedDays(dir, path, { fromOffset, toOffset, impressions, clicks, position }) {
  for (let d = fromOffset; d <= toOffset; d += 1) {
    writeGscDay(dir, isoDay(d), [{ page: `https://buildwithidris.com${path}`, clicks, impressions, ctr: clicks / impressions, position }]);
  }
}

test('statistics: z-test separates real changes from noise and flags position confounding', () => {
  assert.equal(content.evaluate({ clicks: 10, impressions: 1000, ctr: 0.01, position: 5 }, { clicks: 40, impressions: 1000, ctr: 0.04, position: 5.2 }).verdict, 'improved');
  assert.equal(content.evaluate({ clicks: 40, impressions: 1000, ctr: 0.04, position: 5 }, { clicks: 10, impressions: 1000, ctr: 0.01, position: 5 }).verdict, 'worsened');
  assert.equal(content.evaluate({ clicks: 20, impressions: 1000, ctr: 0.02, position: 5 }, { clicks: 23, impressions: 1000, ctr: 0.023, position: 5 }).verdict, 'no-significant-change');
  assert.equal(content.evaluate({ clicks: 1, impressions: 50, ctr: 0.02, position: 5 }, { clicks: 5, impressions: 60, ctr: 0.08, position: 5 }).verdict, 'insufficient-data');
  assert.equal(content.evaluate({ clicks: 10, impressions: 1000, ctr: 0.01, position: 9 }, { clicks: 40, impressions: 1000, ctr: 0.04, position: 4 }).verdict, 'confounded');
});

test('experiment lifecycle: a losing title is rolled back automatically; a winner is kept; outcomes feed learning', async () => {
  const dir = process.env.SEO_DATA_DIR;
  // loser
  pages.savePageVersion('service:ai-automation', { kind: 'override', status: 'published', data: { title: 'Original override title for automation' }, reason: 'setup' });
  const prevData = pages.currentData(pages.getPage('service:ai-automation'));
  pages.savePageVersion('service:ai-automation', { kind: 'override', data: { title: 'Experimental title for automation page' }, reason: 'experiment' });
  learning.addExperiment({ pageId: 'service:ai-automation', path: '/services/ai-automation', type: 'meta-title', baseline: { clicks: 60, impressions: 2000, ctr: 0.03, position: 6 }, previousData: prevData, startedAt: new Date(Date.now() - 40 * 86400000).toISOString() });
  seedDays(dir, '/services/ai-automation', { fromOffset: -40, toOffset: -1, impressions: 100, clicks: 0.5, position: 6 });
  // winner
  learning.addExperiment({ pageId: 'service:document-processing', path: '/services/document-processing', type: 'meta-title', baseline: { clicks: 10, impressions: 2000, ctr: 0.005, position: 7 }, previousData: null, startedAt: new Date(Date.now() - 40 * 86400000).toISOString() });
  seedDays(dir, '/services/document-processing', { fromOffset: -40, toOffset: -1, impressions: 100, clicks: 3, position: 7 });
  // also add winner's day rows alongside loser rows: rewrite files with both pages
  for (let d = -40; d <= -1; d += 1) {
    const file = path.join(dir, 'gsc', 'daily', `${isoDay(d)}.json`);
    const day = JSON.parse(fs.readFileSync(file, 'utf8'));
    day.pages = [
      { page: 'https://buildwithidris.com/services/ai-automation', clicks: 0.5, impressions: 100, ctr: 0.005, position: 6 },
      { page: 'https://buildwithidris.com/services/document-processing', clicks: 3, impressions: 100, ctr: 0.03, position: 7 }
    ];
    fs.writeFileSync(file, JSON.stringify(day));
  }
  const results = await content.evaluateExperiments();
  const exps = learning.listExperiments();
  const loser = exps.find((e) => e.pageId === 'service:ai-automation');
  const winner = exps.find((e) => e.pageId === 'service:document-processing');
  assert.equal(loser.status, 'reverted', JSON.stringify(results));
  assert.equal(pages.currentData(pages.getPage('service:ai-automation')).title, 'Original override title for automation', 'rolled back to the previous version');
  assert.equal(winner.status, 'kept');
  const stats = learning.outcomeStats()['meta-title'];
  assert.equal(stats.trials, 2);
  assert.equal(stats.improved, 1);
  assert.equal(stats.worsened, 1);
});

test('performance analyzer flags low CTR, declines and cannibalization from stored history', () => {
  const dir = process.env.SEO_DATA_DIR;
  for (let d = -56; d <= -1; d += 1) {
    const recent = d > -29;
    writeGscDay(dir, isoDay(d), [
      { page: 'https://buildwithidris.com/', clicks: 0, impressions: 20, ctr: 0, position: 3 },
      { page: 'https://buildwithidris.com/services/website-design-development', clicks: recent ? 0 : 2, impressions: 30, ctr: 0, position: 8 }
    ], [
      { page: 'https://buildwithidris.com/', query: 'web developer phoenix', clicks: 0, impressions: 7, position: 9 },
      { page: 'https://buildwithidris.com/services/website-design-development', query: 'web developer phoenix', clicks: 0, impressions: 5, position: 11 }
    ]);
  }
  const r = perf.analyze();
  assert.equal(r.status, 'ok');
  assert.ok(r.findings.lowCtr.some((x) => x.path === '/'), 'homepage CTR far below position expectation');
  assert.ok(r.findings.declining.some((x) => x.path === '/services/website-design-development'));
  assert.ok(r.findings.cannibalization.some((x) => x.query === 'web developer phoenix'));
  assert.ok(r.findings.coverageGaps.some((x) => x.query === 'web developer phoenix'));
});

test('no data is reported as no data, not as zero performance', () => {
  const r = perf.analyze();
  assert.equal(r.status, 'no-data');
});

test('keyword dataset: every keyword has a status and at most one target page', () => {
  const ds = JSON.parse(fs.readFileSync(path.join(BACKEND, '..', 'seo_engine', 'keyword_research', 'keyword_data.json'), 'utf8'));
  const allowed = new Set(['existing-page', 'missing-page', 'expansion-opportunity', 'consolidation-opportunity', 'not-relevant', 'requires-evidence']);
  for (const k of ds.keywords) {
    assert.ok(allowed.has(k.status), k.keyword);
    assert.ok(k.targetUrl === null || typeof k.targetUrl === 'string');
    assert.equal(k.searchVolume, null, 'no invented volumes');
  }
});
