// Turns the live, owner-edited site content (content.json via getContent) into
// (a) a parsed site object for renderers and (b) a list of citable evidence
// facts with stable ids. The content agent may only make claims that cite
// these ids, and the quality gate checks every number it writes against them.
import { SERVICES } from './catalog.js';

function parse(raw, fallback) {
  try { const v = JSON.parse(raw); return v ?? fallback; } catch { return fallback; }
}

export function loadSite(getContent) {
  const { data, updatedAt } = getContent();
  return {
    updatedAt,
    profile: parse(data['idris-profile'], {}),
    stats: parse(data['idris-stats'], []),
    projects: parse(data['idris-projects'], []),
    aiSystems: parse(data['idris-ai-systems'], []),
    agency: parse(data['idris-agency'], {}),
    experience: parse(data['idris-experience'], []),
    education: parse(data['idris-education'], []),
    certifications: parse(data['idris-certifications'], []),
    contactInfo: parse(data['idris-contact-info'], {}),
    references: parse(data['idris-references'], []),
    floatingVideo: parse(data['idris-floating-video'], {})
  };
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function evidenceFacts(site) {
  const facts = [];
  const add = (id, text, source) => { if (text && String(text).trim()) facts.push({ id, text: stripHtml(text), source }); };
  const p = site.profile || {};
  add('profile.title', `${p.name || ''}, ${p.title || ''}, based in ${p.location || ''}`, 'profile');
  add('profile.headline', p.headline, 'profile');
  add('profile.subtitle', p.subtitle, 'profile');
  add('profile.bio', p.bio, 'profile');
  String(p.aboutMe || '').split(/\n\s*\n/).forEach((para, i) => add(`profile.about.${i}`, para, 'profile'));
  (site.stats || []).forEach((s, i) => add(`stat.${i}`, `${s.num} ${s.label}`, 'stats'));
  (site.projects || []).forEach((pr) => {
    add(`project.${pr.id}`, `${pr.title}: ${pr.desc || pr.shortDesc || ''} Technologies: ${(pr.tags || []).join(', ')}. Status: ${pr.status || ''}.`, 'projects');
  });
  (site.aiSystems || []).forEach((a, i) => add(`ai.${i}`, `${a.title}: ${a.desc}`, 'aiSystems'));
  const ag = site.agency || {};
  add('agency.description', ag.description, 'agency');
  add('agency.area', ag.serviceArea, 'agency');
  (ag.services || []).forEach((s, i) => add(`agency.service.${i}`, `${s.title}: ${s.desc}`, 'agency'));
  (site.experience || []).forEach((e, i) => {
    add(`exp.${i}`, `${e.role} at ${e.company} (${e.dates})`, 'experience');
    (e.bullets || []).forEach((b, j) => add(`exp.${i}.${j}`, `${e.company}: ${b}`, 'experience'));
  });
  (site.education || []).forEach((e, i) => add(`edu.${i}`, `${e.degree}, ${e.school} (${e.dates || ''})`, 'education'));
  (site.certifications || []).forEach((c, i) => add(`cert.${i}`, c.name, 'certifications'));
  for (const s of SERVICES) {
    add(`service.${s.slug}`, `${s.name}: ${s.lead} Included: ${s.included.map((x) => `${x.title} (${x.desc})`).join('; ')}`, 'catalog');
  }
  add('owner.area', 'Based in Phoenix, Arizona; works with local clients in person and with clients anywhere in the United States remotely.', 'owner-confirmed');
  return facts;
}

export function evidenceCorpus(site) {
  return evidenceFacts(site).map((f) => f.text).join('\n');
}

// Numbers as they appear in evidence, normalised ("1,200+" -> "1200").
export function numbersIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(m[0].replace(/,/g, ''));
  return out;
}
