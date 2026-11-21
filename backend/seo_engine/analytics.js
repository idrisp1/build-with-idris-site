// First-party, cookie-less traffic measurement. For every HTML page request it
// records an aggregate count (day -> path -> source), and for crawlers the bot
// name. No IP addresses, user agents, cookies or personal data are stored.
// Contact-form conversions are attributed to their first-touch source using
// the sessionStorage snippet on every page.
import { readJson, writeJson, appendJsonl, readJsonl, listFiles, today } from './store.js';

const BOTS = [
  ['OAI-SearchBot', 'ai-search'], ['ChatGPT-User', 'ai-search'], ['PerplexityBot', 'ai-search'], ['Perplexity-User', 'ai-search'],
  ['Claude-SearchBot', 'ai-search'], ['Claude-User', 'ai-search'], ['DuckAssistBot', 'ai-search'], ['MistralAI-User', 'ai-search'],
  ['GPTBot', 'ai-training'], ['ClaudeBot', 'ai-training'], ['CCBot', 'ai-training'], ['Google-Extended', 'ai-training'],
  ['Applebot-Extended', 'ai-training'], ['meta-externalagent', 'ai-training'], ['Bytespider', 'ai-training'],
  ['Googlebot', 'search'], ['bingbot', 'search'], ['Applebot', 'search'], ['DuckDuckBot', 'search'], ['YandexBot', 'search'],
  ['facebookexternalhit', 'preview'], ['LinkedInBot', 'preview'], ['Twitterbot', 'preview'], ['Slackbot', 'preview'],
  ['Discordbot', 'preview'], ['WhatsApp', 'preview'], ['TelegramBot', 'preview'],
  ['AhrefsBot', 'seo-tool'], ['SemrushBot', 'seo-tool'], ['Chrome-Lighthouse', 'seo-tool']
];
const GENERIC_BOT = /bot|crawler|spider|crawl|headless|curl\/|wget|python-requests|python-httpx|node-fetch|axios|go-http-client|java\//i;

export function classifyAgent(ua) {
  const s = String(ua || '');
  for (const [name, kind] of BOTS) if (s.toLowerCase().includes(name.toLowerCase())) return { bot: name, kind };
  if (!s || GENERIC_BOT.test(s)) return { bot: 'other-bot', kind: 'other' };
  return null;
}

const SOURCES = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, 'ai:chatgpt'],
  [/(^|\.)perplexity\.ai$/, 'ai:perplexity'],
  [/(^|\.)copilot\.microsoft\.com$/, 'ai:copilot'],
  [/(^|\.)gemini\.google\.com$/, 'ai:gemini'],
  [/(^|\.)claude\.ai$/, 'ai:claude'],
  [/(^|\.)google\.[a-z.]+$/, 'search:google'],
  [/(^|\.)bing\.com$/, 'search:bing'],
  [/(^|\.)duckduckgo\.com$/, 'search:duckduckgo'],
  [/(^|\.)search\.yahoo\.com$|(^|\.)yahoo\.com$/, 'search:yahoo'],
  [/(^|\.)ecosia\.org$/, 'search:ecosia'],
  [/(^|\.)yandex\.[a-z]+$/, 'search:yandex'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'social:linkedin'],
  [/(^|\.)facebook\.com$|^fb\.me$|(^|\.)fb\.com$/, 'social:facebook'],
  [/(^|\.)instagram\.com$/, 'social:instagram'],
  [/(^|\.)tiktok\.com$/, 'social:tiktok'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'social:youtube'],
  [/(^|\.)reddit\.com$/, 'social:reddit'],
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'social:x'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'social:pinterest']
];
const UTM_SOURCES = { 'chatgpt.com': 'ai:chatgpt', 'perplexity': 'ai:perplexity', 'copilot': 'ai:copilot', 'linkedin': 'social:linkedin', 'facebook': 'social:facebook', 'instagram': 'social:instagram', 'tiktok': 'social:tiktok', 'youtube': 'social:youtube', 'reddit': 'social:reddit' };

export function classifySource({ referrerHost, utmSource, ownHost }) {
  const utm = String(utmSource || '').toLowerCase();
  if (utm) {
    for (const [k, v] of Object.entries(UTM_SOURCES)) if (utm.includes(k)) return v;
    return `utm:${utm.slice(0, 40)}`;
  }
  const host = String(referrerHost || '').toLowerCase().replace(/^www\./, '');
  if (!host || host === String(ownHost || '').replace(/^www\./, '')) return 'direct';
  for (const [re, name] of SOURCES) if (re.test(host)) return name;
  return `referral:${host.slice(0, 60)}`;
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

export function recordRequest(req, path) {
  try {
    if (req.method !== 'GET') return;
    const d = today();
    const file = `analytics/daily/${d}.json`;
    const day = readJson(file, { date: d, views: {}, sources: {}, bots: {} });
    const agent = classifyAgent(req.get('user-agent'));
    if (agent) {
      const b = (day.bots[agent.bot] ||= { kind: agent.kind, hits: 0, paths: {} });
      b.hits += 1;
      b.paths[path] = (b.paths[path] || 0) + 1;
    } else {
      const source = classifySource({ referrerHost: hostOf(req.get('referer')), utmSource: req.query?.utm_source, ownHost: req.hostname });
      const v = (day.views[path] ||= {});
      v[source] = (v[source] || 0) + 1;
      day.sources[source] = (day.sources[source] || 0) + 1;
    }
    writeJson(file, day);
  } catch { /* measurement must never break a page view */ }
}

export function recordConversion({ type = 'contact-form', attribution, ownHost }) {
  const a = attribution && typeof attribution === 'object' ? attribution : {};
  const clip = (v, n = 80) => String(v || '').slice(0, n);
  const entry = {
    at: new Date().toISOString(),
    type,
    landing: clip(a.landing, 200),
    source: classifySource({ referrerHost: clip(a.ref), utmSource: clip(a.utm_source), ownHost }),
    utmSource: clip(a.utm_source),
    utmMedium: clip(a.utm_medium),
    utmCampaign: clip(a.utm_campaign)
  };
  appendJsonl('analytics/conversions.jsonl', entry);
  return entry;
}

export function summary({ days = 28 } = {}) {
  const files = listFiles('analytics/daily').filter((f) => f.endsWith('.json')).slice(-days);
  const sources = {};
  const pages = {};
  const bots = {};
  for (const f of files) {
    const d = readJson(`analytics/daily/${f}`, null);
    if (!d) continue;
    for (const [s, n] of Object.entries(d.sources || {})) sources[s] = (sources[s] || 0) + n;
    for (const [p, srcs] of Object.entries(d.views || {})) for (const n of Object.values(srcs)) pages[p] = (pages[p] || 0) + n;
    for (const [b, rec] of Object.entries(d.bots || {})) {
      const t = (bots[b] ||= { kind: rec.kind, hits: 0 });
      t.hits += rec.hits;
    }
  }
  const since = files[0] ? files[0].slice(0, 10) : null;
  const conversions = readJsonl('analytics/conversions.jsonl').filter((c) => !since || c.at.slice(0, 10) >= since);
  const aiReferrals = Object.entries(sources).filter(([s]) => s.startsWith('ai:')).reduce((n, [, v]) => n + v, 0);
  return { days: files.length, since, sources, pages, bots, aiReferrals, conversions: conversions.length, conversionsBySource: conversions.reduce((m, c) => ({ ...m, [c.source]: (m[c.source] || 0) + 1 }), {}) };
}
