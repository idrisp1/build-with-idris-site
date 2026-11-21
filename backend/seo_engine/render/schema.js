// Schema.org JSON-LD, emitted as ONE linked @graph per page. Built only from
// real fields (live content + verified catalog). Deliberately never emits
// AggregateRating, Review, offers with prices, or any field the site cannot
// back up.
import { config } from '../config.js';
import { SERVICES } from '../catalog.js';

function clean(obj) {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (v === '' || (Array.isArray(v) && v.length === 0) ? undefined : v)));
}

export function absUrl(origin, maybeRelative) {
  if (!maybeRelative) return undefined;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${origin}${maybeRelative.startsWith('/') ? '' : '/'}${maybeRelative}`;
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function ids(origin) {
  return { website: `${origin}/#website`, person: `${origin}/#person`, agency: `${origin}/#agency` };
}

export function baseGraph(site) {
  const { origin, areaServed } = config();
  const id = ids(origin);
  const p = site.profile || {};
  const c = site.contactInfo || {};
  const ag = site.agency || {};
  const name = p.name || 'Idris Paul Kwaya';
  const sameAs = [p.github, p.linkedin].filter((v) => typeof v === 'string' && v.trim());
  const knowsAbout = [...new Set((site.projects || []).flatMap((x) => x.tags || []).concat((site.aiSystems || []).map((a) => a.title)))];
  const address = { '@type': 'PostalAddress', addressLocality: areaServed.city, addressRegion: areaServed.region, addressCountry: 'US' };
  const areas = [
    { '@type': 'City', name: `${areaServed.city}, ${areaServed.region}` },
    { '@type': 'Country', name: areaServed.country }
  ];

  const person = clean({
    '@type': 'Person',
    '@id': id.person,
    name,
    alternateName: p.fullName && p.fullName !== name ? p.fullName : undefined,
    jobTitle: p.title || undefined,
    description: stripHtml(p.bio || p.headline) || undefined,
    url: `${origin}/`,
    image: absUrl(origin, p.photo) || undefined,
    sameAs,
    address,
    knowsAbout,
    alumniOf: (site.education || []).map((e) => ({ '@type': 'CollegeOrUniversity', name: e.school })),
    hasCredential: (site.certifications || []).map((cert) => ({ '@type': 'EducationalOccupationalCredential', name: cert.name }))
  });

  const website = clean({
    '@type': 'WebSite',
    '@id': id.website,
    url: `${origin}/`,
    name,
    inLanguage: 'en-US',
    publisher: { '@id': id.person }
  });

  const graph = [website, person];

  if (ag.name || ag.brandName) {
    graph.push(clean({
      '@type': 'ProfessionalService',
      '@id': id.agency,
      name: ag.brandName || ag.name,
      description: stripHtml(ag.description) || undefined,
      slogan: ag.tagline || undefined,
      url: `${origin}/services`,
      telephone: c.phone || undefined,
      email: c.email || undefined,
      address,
      areaServed: areas,
      founder: { '@id': id.person },
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Services',
        itemListElement: SERVICES.map((s) => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', '@id': `${origin}/services/${s.slug}#service`, name: s.name, url: `${origin}/services/${s.slug}` }
        }))
      }
    }));
  }
  return graph;
}

export function breadcrumbList(origin, url, crumbs) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${origin}${c.path}` }))
  };
}

export function webPage(origin, url, { name, description, crumbs, about, type = 'WebPage', dateModified }) {
  return clean({
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { '@id': `${origin}/#website` },
    about: about || undefined,
    breadcrumb: crumbs ? { '@id': `${url}#breadcrumb` } : undefined,
    dateModified: dateModified || undefined,
    inLanguage: 'en-US'
  });
}

export function faqPage(url, faqs) {
  if (!faqs?.length) return null;
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };
}

export function serviceNode(origin, s) {
  const { areaServed } = config();
  return clean({
    '@type': 'Service',
    '@id': `${origin}/services/${s.slug}#service`,
    name: s.name,
    serviceType: s.name,
    description: s.metaDescription,
    url: `${origin}/services/${s.slug}`,
    provider: { '@id': s.agencyTitle ? `${origin}/#agency` : `${origin}/#person` },
    areaServed: [
      { '@type': 'City', name: `${areaServed.city}, ${areaServed.region}` },
      { '@type': 'Country', name: areaServed.country }
    ]
  });
}

export function jsonLdScript(graph) {
  const body = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph.filter(Boolean) });
  return `<script type="application/ld+json">${body.replace(/<\//g, '<\\/')}</script>`;
}
