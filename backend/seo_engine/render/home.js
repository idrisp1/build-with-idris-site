// Server-side prerender of the existing homepage (index.html). The markup
// produced here MUST mirror the client render functions in index.html
// (renderProfile, renderStats, renderProjects, renderAiSystems, renderAgency,
// renderExperience, renderEducation, renderReferences, renderContact), so the
// page looks identical before and after the client JS re-renders it. The point
// is that crawlers which do not execute JavaScript (OAI-SearchBot,
// PerplexityBot, link previewers, ...) receive the real content.
import { config } from '../config.js';
import { agencyServiceLinks } from '../catalog.js';
import { effectiveMeta } from '../pages.js';
import { esc, ATTRIBUTION_SNIPPET, verificationMeta } from './layout.js';
import { baseGraph, webPage, jsonLdScript } from './schema.js';
import { projectSlug } from './pages.js';

export class PrerenderError extends Error {}

// Replace the inner HTML of the element carrying id="<id>". Throws if the
// template no longer contains it, so a future edit to index.html fails tests
// loudly instead of silently shipping an empty page to crawlers.
function fill(html, id, inner) {
  const re = new RegExp(`(<(\\w+)([^>]*)\\bid="${id}"([^>]*)>)([\\s\\S]*?)(</\\2>)`);
  if (!re.test(html)) throw new PrerenderError(`prerender: #${id} not found in index.html`);
  return html.replace(re, (_m, open, _tag, _a, _b, _old, close) => `${open}${inner}${close}`);
}

function setAttr(html, id, attr, value) {
  const re = new RegExp(`(<\\w+[^>]*\\bid="${id}"[^>]*?)\\s${attr}="[^"]*"`);
  if (re.test(html)) return html.replace(re, `$1 ${attr}="${value}"`);
  const re2 = new RegExp(`(<\\w+[^>]*\\bid="${id}")`);
  if (!re2.test(html)) throw new PrerenderError(`prerender: #${id} not found in index.html`);
  return html.replace(re2, `$1 ${attr}="${value}"`);
}

function gradientForIndex(i) { return ['ph-gradient-1', 'ph-gradient-2', 'ph-gradient-3', 'ph-gradient-4'][i % 4]; }

export function homeMeta(site) {
  const p = site.profile || {};
  const name = p.name || 'Idris Paul Kwaya';
  return effectiveMeta('page:home', {
    title: `${name} | ${p.title || 'AI Systems Engineer'} in Phoenix, AZ`,
    metaDescription: `${p.title || 'AI Systems Engineer'} in Phoenix building production AI systems, custom software and websites. Live client projects, real code, and services for businesses across the U.S.`
  });
}

export function prerenderHome(template, site) {
  const { origin } = config();
  const p = site.profile || {};
  const name = p.name || 'Idris Paul Kwaya';
  const meta = homeMeta(site);
  let html = template;

  // ---- head ----
  html = html
    .replace('__PAGE_TITLE__', esc(meta.title))
    .replace('__META_DESC__', esc(meta.metaDescription))
    .replace('__SITE_NAME__', esc(name))
    .replace('__HEAD_EXTRA__', `${verificationMeta()}\n${ATTRIBUTION_SNIPPET}\n<script>window.__SERVICE_LINKS__=${JSON.stringify(agencyServiceLinks()).replace(/</g, '\\u003c')};</script>`);
  const graph = [...baseGraph(site), webPage(origin, `${origin}/`, { name: meta.title, description: meta.metaDescription, type: 'ProfilePage', about: { '@id': `${origin}/#person` } })];
  html = html.replace('__JSON_LD__', jsonLdScript(graph));

  // ---- profile / hero (mirrors renderProfile) ----
  const initials = (name || 'I P').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  html = fill(html, 'navName', esc(name));
  html = fill(html, 'heroAvailability', esc(p.availability || 'Available for select engagements'));
  html = fill(html, 'heroHeadline', esc(p.headline || '') || 'Building <span>production-ready AI and backend systems</span> that actually ship.');
  html = fill(html, 'heroSubtitle', p.subtitle || '');
  html = fill(html, 'heroBio', esc(p.bio || ''));
  html = fill(html, 'heroLocationBadge', p.location ? esc(`\u{1F4CD} ${p.location}`) : '');
  for (const [id, url] of [['heroGithub', p.github], ['heroLinkedin', p.linkedin], ['heroResume', p.resumeUrl]]) {
    html = setAttr(html, id, 'href', esc(url || '#'));
    html = setAttr(html, id, 'style', url ? 'display:flex' : 'display:none');
  }
  html = fill(html, 'heroPhotoInner', p.photo ? `<img src="${esc(p.photo)}" alt="${esc(name)}">` : `<span class="initials">${esc(initials || 'IP')}</span>`);
  if (p.coverImage) {
    html = setAttr(html, 'heroCover', 'style', `background-image: url(${esc(JSON.stringify(p.coverImage))})`);
    html = html.replace('class="hero-cover" id="heroCover"', 'class="hero-cover set" id="heroCover"');
  }
  html = fill(html, 'footerCopy', `&copy; 2026 ${esc(name)}. Built with intention.`);
  const paragraphs = String(p.aboutMe || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  html = fill(html, 'aboutMeText', paragraphs.map((t) => `<p>${esc(t)}</p>`).join(''));

  // ---- stats ----
  html = fill(html, 'statRow', (site.stats || []).map((s) => `
    <div class="stat"><div class="num">${esc(s.num)}</div><div class="label">${esc(s.label)}</div></div>
  `).join(''));

  // ---- projects (mirrors renderProjects) ----
  const projects = site.projects || [];
  const featured = projects.filter((x) => x.featured).slice(0, 3);
  html = fill(html, 'featuredGrid', featured.map((x, i) => `
    <div class="fcard glass" data-open-project="${x.id}">
      <div class="admin-only edit-affordance" data-edit-project="${x.id}">&#9998;</div>
      <div class="fcard-media ${x.img ? '' : gradientForIndex(i)}">
        ${x.img ? `<img src="${esc(x.img)}" alt="${esc(x.title)} screenshot">` : ''}
        <span class="fcard-tag">Featured</span>
        ${x.video ? '<div class="fcard-play"><div class="circle">&#9654;</div></div>' : ''}
      </div>
      <div class="fcard-body">
        <h3>${esc(x.title)}</h3>
        <p>${esc(x.shortDesc || '')}</p>
        <div class="tags">${(x.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <div class="fcard-link">View Details <span class="arrow">&rarr;</span></div>
      </div>
    </div>
  `).join('') + '<div class="fcard glass add-card admin-only" id="addFeaturedCard"><div class="plus">+</div>Add a Featured Project</div>');

  html = fill(html, 'projectsGrid', projects.map((x, i) => `
    <div class="pcard glass">
      <div class="admin-only edit-affordance" data-edit-project="${x.id}">&#9998;</div>
      <div class="admin-only delete-affordance" data-delete-project="${x.id}">&#128465;</div>
      <div class="pcard-thumb ${x.img ? '' : gradientForIndex(i)}">${x.img ? `<img src="${esc(x.img)}" alt="${esc(x.title)}">` : ''}</div>
      <div class="pcard-body">
        <h4>${esc(x.title)}</h4>
        <p>${esc(x.desc || x.shortDesc || '')}</p>
        <div class="pcard-meta">
          <span class="status-live"><span class="dot2"></span> ${esc(x.status || 'Live')}</span>
          ${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.link.replace(/^https?:\/\//, ''))}</a>` : ''}
          ${x.github ? `<a href="${esc(x.github)}" target="_blank" rel="noopener">GitHub</a>` : ''}
          <a href="/projects/${esc(projectSlug(x.id))}">Case study</a>
        </div>
      </div>
    </div>
  `).join('') + '<div class="pcard glass add-card admin-only" style="min-height:auto; padding:26px;" id="addProjectCard"><div class="plus">+</div>Add a Project</div>');

  // ---- AI systems ----
  html = fill(html, 'aiGrid', (site.aiSystems || []).map((c, i) => `
    <div class="ai-card glass ${c.video ? 'has-video' : ''}" ${c.video ? `data-watch-ai="${i}"` : ''}>
      <div class="ai-icon">${['&#129504;', '&#9889;', '&#129302;', '&#128268;'][i % 4]}</div>
      <h4>${esc(c.title)}</h4>
      <p>${esc(c.desc)}</p>
      <span class="status-badge ${c.badgeType === 'real' ? 'badge-real' : 'badge-tbd'}">${esc(c.badge)}</span>
      ${c.video ? '<div class="ai-watch"><span class="circle">&#9654;</span> Watch the walkthrough</div>' : ''}
    </div>
  `).join(''));

  // ---- agency (mirrors renderAgency) ----
  const a = site.agency || {};
  const links = agencyServiceLinks();
  html = fill(html, 'agencyName', esc(a.name || "Idris's Digital Marketing & Web Design AI Agency"));
  html = fill(html, 'agencyEyebrow', esc(a.brandName ? `Also running — ${a.brandName}` : 'Also running'));
  html = fill(html, 'agencyDesc', esc(a.tagline ? `${a.tagline.replace(/\.+$/, '')}. ${a.description || ''}` : (a.description || '')));
  html = fill(html, 'agencyArea', esc(a.serviceArea || ''));
  html = fill(html, 'agencyGrid', (a.services || []).map((s, i) => `
    <div class="ai-card glass">
      <div class="ai-icon">${['&#128200;', '&#127760;', '&#128269;', '&#127991;', '&#128196;', '&#128270;', '&#9881;'][i % 7]}</div>
      <h4>${esc(s.title)}</h4>
      <p>${esc(s.desc)}</p>
      ${links[s.title] ? `<a class="ai-watch" href="${links[s.title]}">Learn more &rarr;</a>` : ''}
    </div>
  `).join(''));

  // ---- experience ----
  html = fill(html, 'timelineList', (site.experience || []).map((e) => `
    <div class="tl-item">
      <div class="tl-dot"></div>
      <div class="tl-card glass">
        <div class="tl-top">
          <div><h4>${esc(e.role)}</h4><div class="tl-company">${esc(e.company)}</div></div>
          <div class="tl-dates">${esc(e.dates)}</div>
        </div>
        <ul>${(e.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      </div>
    </div>
  `).join(''));

  // ---- education ----
  html = fill(html, 'eduList', (site.education || []).map((ed) => `
    <div class="edu-item">
      <div class="edu-icon">${esc((ed.school || '').split(' ').filter((w) => w[0] === w[0].toUpperCase()).slice(0, 2).map((w) => w[0]).join('') || 'ED')}</div>
      <div><h4>${esc(ed.school)}</h4><div class="sub">${esc(ed.degree)}</div>${ed.dates ? `<div class="when">${esc(ed.dates)}</div>` : ''}</div>
    </div>
  `).join(''));
  html = fill(html, 'certList', (site.certifications || []).map((c) => `
    <div class="cert-chip"><span class="badge">&#9729;</span><span class="name">${esc(c.name)}</span></div>
  `).join('') || '<p style="font-size:13px; color:var(--text-low);">No certifications listed yet.</p>');

  // ---- references ----
  html = fill(html, 'refGrid', (site.references || []).map((r) => `
    <div class="ref-card glass">
      <div class="ref-quote-mark">&#8220;</div>
      <p class="ref-quote">${esc(r.quote)}</p>
      <div class="ref-org">${esc(r.org)}</div>
    </div>
  `).join('') || '<p style="font-size:13px; color:var(--text-low);">No references listed yet.</p>');

  // ---- contact (mirrors renderContact) ----
  const c = site.contactInfo || {};
  html = fill(html, 'contactEmail', esc(c.email || ''));
  html = fill(html, 'contactPhone', esc(c.phone || ''));
  html = fill(html, 'contactLocation', esc(c.location || ''));
  html = fill(html, 'contactLinkedin', esc(c.linkedin || ''));
  html = setAttr(html, 'contactEmailLink', 'href', c.email ? esc(`mailto:${c.email}`) : '#');
  html = setAttr(html, 'contactPhoneLink', 'href', c.phone ? esc(`tel:${c.phone.replace(/[^\d+]/g, '')}`) : '#');
  const linkedinUrl = c.linkedin ? (c.linkedin.startsWith('http') ? c.linkedin : `https://${c.linkedin}`) : '#';
  html = setAttr(html, 'contactLinkedinLink', 'href', esc(linkedinUrl));

  // Share-card placeholders kept from the original implementation.
  const ogImage = p.photo ? (/^https?:\/\//i.test(p.photo) ? p.photo : `${origin}${p.photo.startsWith('/') ? '' : '/'}${p.photo}`) : `${origin}/assets/images/share-fallback.jpg`;
  html = html
    .replaceAll('__OG_TITLE__', esc(meta.title))
    .replaceAll('__OG_DESC__', esc(meta.metaDescription))
    .replaceAll('__OG_IMAGE__', esc(ogImage))
    .replaceAll('__OG_URL__', esc(`${origin}/`));
  return html;
}
