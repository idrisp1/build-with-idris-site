// Server-rendered subpages. All content comes from (a) the verified service
// catalog and (b) the live owner-edited content.json, so pages update when the
// owner edits their profile/projects, and nothing is invented here.
import { config } from '../config.js';
import { SERVICES, SERVICE_BY_SLUG, PROJECT_SERVICE, PROJECT_EXPERIENCE } from '../catalog.js';
import { listPages, currentData, effectiveMeta } from '../pages.js';
import { layout, esc, ctaBlock } from './layout.js';
import { baseGraph, breadcrumbList, webPage, faqPage, serviceNode, jsonLdScript, absUrl } from './schema.js';

const MIN_PROJECT_WORDS = 25;

function wordCount(s) {
  return String(s || '').split(/\s+/).filter(Boolean).length;
}

export function projectSlug(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function referenceFor(site, project) {
  const title = String(project.title || '').toLowerCase();
  const pid = String(project.id || '').toLowerCase();
  const ref = (site.references || []).find((r) => {
    const org = String(r.org || '').toLowerCase();
    return org && (title.includes(org) || (pid.length > 3 && org.includes(pid)));
  });
  if (!ref) return null;
  // Only the quote itself; contact lines stay in the References section.
  const quote = String(ref.quote || '').split(/\n\s*(?:Email|Phone)\s*:/i)[0].replace(/^[“"\s]+|[”"\s]+$/g, '').trim();
  return quote ? { quote, org: ref.org } : null;
}

function experienceFor(site, projectId) {
  const needles = PROJECT_EXPERIENCE[projectId] || [];
  return (site.experience || []).filter((e) => needles.some((n) => String(e.company || '').includes(n)));
}

export function projectInfo(site, project) {
  const exp = experienceFor(site, project.id);
  const ref = referenceFor(site, project);
  const specificWords = wordCount(project.desc || project.shortDesc) + exp.reduce((n, e) => n + wordCount((e.bullets || []).join(' ')), 0) + wordCount(ref?.quote);
  return { exp, ref, specificWords, indexable: specificWords >= MIN_PROJECT_WORDS };
}

export function publishedArticles() {
  return listPages({ kind: 'article', status: 'published' })
    .map((p) => ({ id: p.id, slug: p.id.replace(/^article:/, ''), data: currentData(p), publishedAt: p.publishedAt, updatedAt: p.updatedAt }))
    .filter((a) => a.data);
}

function projectCard(p) {
  const slug = projectSlug(p.id);
  return `<a class="card glass" href="/projects/${esc(slug)}">
    ${p.img ? `<div class="media"><img src="/${esc(String(p.img).replace(/^\//, ''))}" alt="${esc(p.title)} screenshot" loading="lazy" width="640" height="360"></div>` : ''}
    <h3>${esc(p.title)}</h3><p>${esc(p.shortDesc || p.desc || '')}</p><span class="more">Read the case study &rarr;</span></a>`;
}

function serviceCard(s) {
  return `<a class="card glass" href="/services/${s.slug}"><h3>${esc(s.name)}</h3><p>${esc(s.lead.split('. ')[0])}.</p><span class="more">Learn more &rarr;</span></a>`;
}

function faqHtml(faqs) {
  if (!faqs?.length) return '';
  return `<section class="block faq"><h2>Frequently asked questions</h2>${faqs.map((f) => `<details class="glass"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>`;
}

function areaLine() {
  const { areaServed } = config();
  return `Based in ${areaServed.city}, Arizona. Working with local businesses in person and with clients across the ${areaServed.country} remotely.`;
}

// ---------- /services ----------
export function servicesHubMeta() {
  return effectiveMeta('page:services', {
    title: 'Services: AI, Software, Web Design & SEO in Phoenix | Idris Paul Kwaya',
    metaDescription: 'AI development, automation, custom software, website design, SEO and data services from Phoenix-based AI Systems Engineer Idris Paul Kwaya, for U.S. clients.'
  });
}

export function renderServicesHub(site) {
  const { origin } = config();
  const meta = servicesHubMeta();
  const url = `${origin}/services`;
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }];
  const engineering = SERVICES.filter((s) => s.engineering);
  const agency = SERVICES.filter((s) => !s.engineering);
  const agencyName = site.agency?.brandName || site.agency?.name || '';
  const body = `
<header class="page-hero">
  <div class="eyebrow">Services</div>
  <h1>What I can build and run for you</h1>
  <p class="lead">I am ${esc(site.profile?.name || 'Idris Paul Kwaya')}, an ${esc(site.profile?.title || 'AI Systems Engineer')}. I take on engineering work directly, and run ${esc(agencyName)} for small-business websites, marketing and data services.</p>
  <p class="area">${esc(areaLine())}</p>
</header>
<section class="block"><h2>Engineering</h2><p class="intro">AI systems, applications and backends, built and deployed by me.</p><div class="card-grid">${engineering.map(serviceCard).join('')}</div></section>
<section class="block"><h2>${esc(agencyName || 'Agency services')}</h2><p class="intro">${esc(site.agency?.tagline || '')}</p><div class="card-grid">${agency.map(serviceCard).join('')}</div></section>
${ctaBlock('Not sure which service fits?', 'Describe the problem and I will tell you honestly whether and how I can help.')}`;
  const graph = [...baseGraph(site), webPage(origin, url, { name: meta.title, description: meta.metaDescription, crumbs, type: 'CollectionPage', about: { '@id': `${origin}/#agency` } }), breadcrumbList(origin, url, crumbs)];
  return layout({ site, title: meta.title, description: meta.metaDescription, path: '/services', crumbs, active: 'services', jsonLd: jsonLdScript(graph), body });
}

// ---------- /services/:slug ----------
export function serviceMeta(s) {
  return effectiveMeta(`service:${s.slug}`, { title: s.title, metaDescription: s.metaDescription });
}

export function renderServicePage(site, slug) {
  const s = SERVICE_BY_SLUG[slug];
  if (!s) return null;
  const { origin } = config();
  const meta = serviceMeta(s);
  const url = `${origin}/services/${s.slug}`;
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }, { name: s.name, path: `/services/${s.slug}` }];
  const projects = (s.proof.projects || []).map((id) => (site.projects || []).find((p) => p.id === id)).filter(Boolean);
  const expBullets = (site.experience || [])
    .filter((e) => (s.proof.experienceMatch || []).some((n) => String(e.company || '').includes(n)))
    .flatMap((e) => (e.bullets || []).map((b) => ({ b, company: e.company })));
  const aiCards = s.proof.aiSystems ? (site.aiSystems || []).filter((a) => a.video || /model|runpod|agent/i.test(a.title)) : [];
  const articles = publishedArticles().filter((a) => a.data.serviceSlug === s.slug);
  const agencyName = site.agency?.brandName || site.agency?.name;

  const proof = (projects.length || expBullets.length || aiCards.length || s.proof.note) ? `
<section class="block"><h2>Proof: work I have shipped</h2>
  ${s.proof.note ? `<p class="intro">${esc(s.proof.note)}</p>` : ''}
  ${projects.length ? `<div class="card-grid">${projects.map(projectCard).join('')}</div>` : ''}
  ${aiCards.length ? `<div class="card-grid" style="margin-top:18px">${aiCards.map((a) => `<a class="card glass" href="/#ai-systems"><h3>${esc(a.title)}</h3><p>${esc(a.desc)}</p>${a.video ? '<span class="more">Watch the walkthrough on the homepage &rarr;</span>' : ''}</a>`).join('')}</div>` : ''}
  ${expBullets.length ? `<div class="glass card" style="margin-top:18px"><h3>From my work experience</h3><ul class="list" style="margin-top:12px">${expBullets.map((x) => `<li>${esc(x.b)} <span style="color:var(--text-low)">(${esc(x.company)})</span></li>`).join('')}</ul></div>` : ''}
</section>` : '';

  const body = `
<header class="page-hero">
  <div class="eyebrow">${esc(s.engineering ? 'Engineering service' : (agencyName || 'Agency service'))}</div>
  <h1>${esc(s.h1)}</h1>
  <p class="lead">${esc(s.lead)}</p>
  <p class="area">${esc(areaLine())}</p>
  <div class="actions"><a class="btn btn-primary" href="/#contact">Talk to me about your project</a><a class="btn btn-ghost" href="/services">All services</a></div>
</header>
<section class="block"><h2>Who this is for</h2><ul class="list">${s.audience.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></section>
<section class="block"><h2>What is included</h2><div class="card-grid">${s.included.map((i) => `<div class="card glass"><h3>${esc(i.title)}</h3><p>${esc(i.desc)}</p></div>`).join('')}</div></section>
${proof}
<section class="block"><h2>How I work</h2><div class="steps">${s.process.map((p) => `<div class="card glass"><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p></div>`).join('')}</div></section>
<section class="block"><h2>Technologies</h2><div class="tags">${s.tech.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></section>
${faqHtml(s.faqs)}
${articles.length ? `<section class="block"><h2>Guides and articles</h2><div class="card-grid two">${articles.map((a) => `<a class="card glass" href="/insights/${esc(a.slug)}"><h3>${esc(a.data.title)}</h3><p>${esc(a.data.summary || a.data.metaDescription)}</p><span class="more">Read &rarr;</span></a>`).join('')}</div></section>` : ''}
<section class="block"><h2>Related services</h2><div class="card-grid">${s.related.map((r) => SERVICE_BY_SLUG[r]).filter(Boolean).map(serviceCard).join('')}</div></section>
${ctaBlock()}`;

  const graph = [
    ...baseGraph(site),
    webPage(origin, url, { name: meta.title, description: meta.metaDescription, crumbs, about: { '@id': `${url}#service` } }),
    serviceNode(origin, s),
    breadcrumbList(origin, url, crumbs),
    faqPage(url, s.faqs)
  ];
  return layout({ site, title: meta.title, description: meta.metaDescription, path: `/services/${s.slug}`, crumbs, active: 'services', jsonLd: jsonLdScript(graph), body });
}

// ---------- /projects/:slug ----------
export function projectMeta(site, p) {
  const desc = String(p.desc || p.shortDesc || '').replace(/\s+/g, ' ').trim();
  return effectiveMeta(`project:${projectSlug(p.id)}`, {
    title: `${p.title}: Case Study | ${site.profile?.name || 'Idris Paul Kwaya'}`,
    metaDescription: desc.length > 158 ? `${desc.slice(0, 155).replace(/\s+\S*$/, '')}...` : desc
  });
}

export function findProjectBySlug(site, slug) {
  return (site.projects || []).find((p) => projectSlug(p.id) === slug) || null;
}

export function renderProjectPage(site, slug) {
  const p = findProjectBySlug(site, slug);
  if (!p) return null;
  const { origin } = config();
  const info = projectInfo(site, p);
  const meta = projectMeta(site, p);
  const path = `/projects/${projectSlug(p.id)}`;
  const url = `${origin}${path}`;
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Projects', path: '/#projects' }, { name: p.title, path }];
  const service = SERVICE_BY_SLUG[PROJECT_SERVICE[p.id]];
  const img = p.img ? `/${String(p.img).replace(/^\//, '')}` : '';
  const video = p.video ? `/${String(p.video).replace(/^\//, '')}` : '';
  const body = `
<header class="page-hero">
  <div class="eyebrow">Case study</div>
  <h1>${esc(p.title)}</h1>
  <p class="lead">${esc(p.desc || p.shortDesc || '')}</p>
  <div class="actions">
    ${p.link ? `<a class="btn btn-primary" href="${esc(p.link)}" target="_blank" rel="noopener">Visit the live site</a>` : ''}
    ${p.github ? `<a class="btn btn-ghost" href="${esc(p.github)}" target="_blank" rel="noopener">View on GitHub</a>` : ''}
    ${p.status ? `<span class="status-live"><span class="dot2"></span> ${esc(p.status)}</span>` : ''}
  </div>
</header>
${video ? `<section class="block"><h2>Walkthrough</h2><div class="media-frame glass"><video controls playsinline preload="none" ${img ? `poster="${esc(img)}"` : ''}><source src="${esc(video)}" type="video/mp4"></video></div></section>`
    : (img ? `<section class="block"><div class="media-frame glass"><img src="${esc(img)}" alt="${esc(p.title)} screenshot" width="1280" height="720"></div></section>` : '')}
${info.exp.length ? `<section class="block"><h2>What I delivered</h2>${info.exp.map((e) => `<div class="card glass" style="margin-bottom:14px"><h3>${esc(e.role)}, ${esc(e.company)}</h3><p style="margin-bottom:10px">${esc(e.dates)}</p><ul class="list">${(e.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>`).join('')}</section>` : ''}
${info.ref ? `<section class="block"><h2>What the client said</h2><blockquote class="card glass"><p style="font-size:17px;color:var(--text-mid)">&ldquo;${esc(info.ref.quote)}&rdquo;</p><p style="margin-top:10px">${esc(info.ref.org)}</p></blockquote></section>` : ''}
<section class="block"><h2>Technologies</h2><div class="tags">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></section>
${service ? `<section class="block"><h2>Need something similar?</h2><div class="card-grid">${serviceCard(service)}</div></section>` : ''}
${ctaBlock()}`;
  const graph = [
    ...baseGraph(site),
    webPage(origin, url, { name: meta.title, description: meta.metaDescription, crumbs, about: { '@id': `${url}#work` } }),
    {
      '@type': 'CreativeWork',
      '@id': `${url}#work`,
      name: p.title,
      description: p.desc || p.shortDesc,
      url: p.link || p.github || url,
      image: img ? absUrl(origin, img) : undefined,
      creator: { '@id': `${origin}/#person` },
      keywords: (p.tags || []).join(', ')
    },
    breadcrumbList(origin, url, crumbs)
  ];
  return layout({
    site, title: meta.title, description: meta.metaDescription, path, crumbs, active: 'projects',
    robots: info.indexable ? 'index, follow' : 'noindex, follow',
    ogImage: img ? absUrl(origin, img) : undefined, jsonLd: jsonLdScript(graph), body
  });
}

// ---------- /insights and /insights/:slug ----------
function inlineLinks(text, validPaths) {
  // Supports [label](/internal-path) only; unknown paths are rendered as plain text.
  return esc(text).replace(/\[([^\]]+)\]\((\/[a-z0-9/#_-]*)\)/gi, (_m, label, href) => (
    validPaths.has(href.split('#')[0]) ? `<a href="${href}">${label}</a>` : label
  ));
}

export function renderInsightsIndex(site) {
  const articles = publishedArticles();
  if (!articles.length) return null; // never publish an empty listing page
  const { origin } = config();
  const meta = effectiveMeta('page:insights', {
    title: `Guides & Insights | ${site.profile?.name || 'Idris Paul Kwaya'}`,
    metaDescription: 'Practical guides on websites, AI, automation and software for small businesses, written from real project experience.'
  });
  const url = `${origin}/insights`;
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Insights', path: '/insights' }];
  const body = `<header class="page-hero"><div class="eyebrow">Insights</div><h1>Guides and insights</h1><p class="lead">${esc(meta.metaDescription)}</p></header>
<section class="block"><div class="card-grid two">${articles.map((a) => `<a class="card glass" href="/insights/${esc(a.slug)}"><h3>${esc(a.data.title)}</h3><p>${esc(a.data.summary || a.data.metaDescription)}</p><span class="more">Read &rarr;</span></a>`).join('')}</div></section>`;
  const graph = [...baseGraph(site), webPage(origin, url, { name: meta.title, description: meta.metaDescription, crumbs, type: 'CollectionPage' }), breadcrumbList(origin, url, crumbs)];
  return layout({ site, title: meta.title, description: meta.metaDescription, path: '/insights', crumbs, jsonLd: jsonLdScript(graph), body });
}

export function renderArticle(site, slug, { validPaths, preview = false } = {}) {
  const pageId = `article:${slug}`;
  const all = listPages({ kind: 'article' });
  const record = all.find((p) => p.id === pageId);
  if (!record || (!preview && record.status !== 'published')) return null;
  const a = currentData(record);
  if (!a) return null;
  const { origin } = config();
  const path = `/insights/${slug}`;
  const url = `${origin}${path}`;
  const service = SERVICE_BY_SLUG[a.serviceSlug];
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Insights', path: '/insights' }, { name: a.title, path }];
  const related = (a.relatedProjects || []).map((id) => (site.projects || []).find((p) => p.id === id)).filter(Boolean);
  const vp = validPaths || new Set();
  const body = `
<article class="prose">
  <header class="page-hero"><div class="eyebrow">Guide</div><h1>${esc(a.h1 || a.title)}</h1><p class="lead">${esc(a.summary || '')}</p>
  <p class="area">By ${esc(site.profile?.name || 'Idris Paul Kwaya')}, ${esc(site.profile?.title || '')} &middot; Updated ${esc(String(record.updatedAt || '').slice(0, 10))}</p></header>
  ${(a.sections || []).map((sec) => `<h2>${esc(sec.heading)}</h2>${(sec.paragraphs || []).map((para) => `<p>${inlineLinks(para, vp)}</p>`).join('')}${sec.bullets?.length ? `<ul>${sec.bullets.map((b) => `<li>${inlineLinks(b, vp)}</li>`).join('')}</ul>` : ''}`).join('\n  ')}
</article>
${related.length ? `<section class="block"><h2>Related projects</h2><div class="card-grid">${related.map(projectCard).join('')}</div></section>` : ''}
${faqHtml(a.faqs)}
${service ? `<section class="block"><h2>Need help with this?</h2><div class="card-grid">${serviceCard(service)}</div></section>` : ''}
${ctaBlock()}`;
  const graph = [
    ...baseGraph(site),
    webPage(origin, url, { name: a.title, description: a.metaDescription, crumbs, dateModified: record.updatedAt }),
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: a.title,
      description: a.metaDescription,
      author: { '@id': `${origin}/#person` },
      publisher: { '@id': `${origin}/#person` },
      datePublished: record.publishedAt || record.createdAt,
      dateModified: record.updatedAt,
      mainEntityOfPage: { '@id': `${url}#webpage` },
      about: service ? { '@id': `${origin}/services/${service.slug}#service` } : undefined
    },
    breadcrumbList(origin, url, crumbs),
    faqPage(url, a.faqs)
  ];
  return layout({
    site, title: a.title, description: a.metaDescription, path, crumbs, ogType: 'article',
    robots: record.status === 'published' ? 'index, follow' : 'noindex, nofollow',
    jsonLd: jsonLdScript(graph), body
  });
}

// ---------- 404 ----------
export function renderNotFound(site) {
  const body = `<header class="page-hero"><div class="eyebrow">404</div><h1>That page does not exist</h1><p class="lead">The link may be outdated. Here is where to go instead.</p>
  <div class="actions"><a class="btn btn-primary" href="/">Home</a><a class="btn btn-ghost" href="/services">Services</a><a class="btn btn-ghost" href="/#projects">Projects</a></div></header>`;
  return layout({ site, title: `Page not found | ${site.profile?.name || 'Idris Paul Kwaya'}`, description: 'Page not found.', path: '/404', robots: 'noindex, follow', body });
}
