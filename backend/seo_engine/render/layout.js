import { config } from '../config.js';
import { SERVICES } from '../catalog.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// First-touch attribution, kept in sessionStorage only (no cookies, no
// third-party script, nothing personal). The contact form sends it along so a
// lead can be attributed to its source (e.g. chatgpt.com, google, bing).
export const ATTRIBUTION_SNIPPET = `<script>(function(){try{var k='bwi_attr';if(sessionStorage.getItem(k))return;var u=new URL(location.href),r='';try{r=document.referrer?new URL(document.referrer).hostname:''}catch(e){}if(r===location.hostname)r='';var q=u.searchParams;sessionStorage.setItem(k,JSON.stringify({landing:location.pathname,ref:r,utm_source:q.get('utm_source')||'',utm_medium:q.get('utm_medium')||'',utm_campaign:q.get('utm_campaign')||''}))}catch(e){}})();</script>`;

export function verificationMeta() {
  const { bingSiteVerification } = config();
  return bingSiteVerification ? `<meta name="msvalidate.01" content="${esc(bingSiteVerification)}">` : '';
}

function crumbsHtml(crumbs) {
  if (!crumbs || crumbs.length < 2) return '';
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs.map((c, i) => (
    i === crumbs.length - 1 ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${esc(c.path)}">${esc(c.name)}</a></li>`
  )).join('')}</ol></nav>`;
}

export function layout({ site, title, description, path, robots = 'index, follow', ogImage, jsonLd = '', crumbs, active, body, ogType = 'website' }) {
  const { origin } = config();
  const name = site.profile?.name || 'Idris Paul Kwaya';
  const canonical = `${origin}${path}`;
  const image = ogImage || `${origin}/assets/images/share-fallback.jpg`;
  const navLink = (href, label, key) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${esc(robots)}">
${verificationMeta()}
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" type="image/svg+xml" href="/assets/images/favicon.svg">
<link rel="stylesheet" href="/assets/css/pages.css">
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:site_name" content="${esc(name)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
${jsonLd}
${ATTRIBUTION_SNIPPET}
</head>
<body>
<nav class="nav">
  <a class="nav-brand" href="/"><span class="brand-mark"><span class="brand-mark-text">IPK</span></span> <span>${esc(name)}</span></a>
  <div class="nav-links">
    ${navLink('/services', 'Services', 'services')}
    ${navLink('/#projects', 'Projects', 'projects')}
    ${navLink('/#ai-systems', 'AI Systems', 'ai')}
    ${navLink('/#agency', 'Agency', 'agency')}
    ${navLink('/#experience', 'Experience', 'experience')}
    ${navLink('/#contact', 'Contact', 'contact')}
  </div>
  <div class="nav-mobile">${navLink('/services', 'Services', 'services')}${navLink('/#projects', 'Projects', 'projects')}${navLink('/#contact', 'Contact', 'contact')}</div>
  <a href="/#contact" class="btn btn-primary btn-sm">Contact Me</a>
</nav>
<main class="page">
${crumbsHtml(crumbs)}
${body}
</main>
<footer>
  <div class="footer-row">
    <div class="fl">&copy; ${new Date().getFullYear()} ${esc(name)}. Phoenix, Arizona &middot; Serving clients across the U.S.</div>
    <div class="footer-links">
      ${SERVICES.map((s) => `<a href="/services/${s.slug}">${esc(s.name)}</a>`).join('\n      ')}
    </div>
  </div>
</footer>
</body>
</html>`;
}

export function ctaBlock(heading = 'Have a project in mind?', text = 'Tell me what you need and I will reply personally.') {
  return `<section class="block"><div class="cta glass"><div><h2>${esc(heading)}</h2><p>${esc(text)}</p></div><a class="btn btn-primary" href="/#contact">Contact Me</a></div></section>`;
}
