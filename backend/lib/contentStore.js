import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');

// Keys the admin can edit and that guests must see synced. Must stay
// byte-for-byte in sync with STORAGE_KEYS in index.html.
export const CONTENT_KEYS = [
  'idris-profile',
  'idris-stats',
  'idris-projects',
  'idris-ai-systems',
  'idris-experience',
  'idris-education',
  'idris-certifications',
  'idris-contact-info',
  'idris-references',
  'idris-section-visibility'
];

const DEFAULT_PROFILE = {
  name: 'Idris Paul',
  fullName: 'Idris Paul Kwaya Quiendum',
  title: 'AI Systems Engineer',
  subtitle: 'AI Systems Engineer &middot; 4+ yrs post-grad designing, training and deploying production platforms',
  bio: 'I design and deliver AI powered workflows, LLM integrations, and full stack production systems, from prompt engineering and agent orchestration to the cloud infrastructure and APIs that keep them running at scale.',
  headline: 'Building production-ready AI and backend systems that actually ship.',
  location: 'Phoenix, AZ',
  availability: 'Available for select engagements',
  photo: '',
  coverImage: 'assets/images/hero-cover-default.svg',
  github: 'https://github.com/idrisp1',
  linkedin: 'https://linkedin.com/in/idris-paul-k-637185335',
  resumeUrl: ''
};

const DEFAULT_STATS = [
  { num: '4+', label: 'Years Post-Grad Experience' },
  { num: '8+', label: 'Production Systems Delivered' },
  { num: '50K+', label: 'Monthly Transactions Processed' },
  { num: '99.97%', label: 'Uptime, Fintech Client' }
];

const DEFAULT_PROJECTS = [
  {
    id: 'forexbot',
    title: 'GBPUSD Forex Bot Startup',
    desc: 'My own startup, as founder and sole developer. Automated trade execution infrastructure for GBP/USD. A private server-side strategy engine generates signals; each client\'s own Expert Advisor executes trades on their own brokerage account, so the platform never takes custody of funds.',
    shortDesc: 'Automated trade execution infrastructure with server-side signal generation and per-client risk controls.',
    tags: ['MQL4/MQL5', 'Python', 'Flask', 'Railway'],
    img: 'assets/screenshots/forexbot-hero.png',
    video: 'assets/videos/forexbot-walkthrough.mp4',
    link: 'https://gbpusdforexbot.com',
    github: '',
    featured: true,
    status: 'Live'
  },
  {
    id: 'peggy',
    title: "Peggy's Locs and Dreads",
    desc: 'A full booking and business management platform for a mobile hair loc business. Single-URL admin and guest architecture with live content sync over Server-Sent Events, image uploads, and a custom-domain production deployment.',
    shortDesc: 'Booking and business management platform with real-time admin and guest content sync.',
    tags: ['Node.js', 'Express', 'Railway', 'Server-Sent Events'],
    img: 'assets/screenshots/peggy-hero.png',
    video: 'assets/videos/peggy-walkthrough.mp4',
    link: 'https://peggylocsanddreads.com',
    github: '',
    featured: true,
    status: 'Live'
  },
  {
    id: 'bokeh',
    title: 'Luxe By Bokeh',
    desc: 'A glassmorphism e-commerce site for a boutique clothing brand, with a full retailer admin panel for managing products, inventory, and site content in real time.',
    shortDesc: 'Glassmorphism e-commerce platform with a full retailer admin panel and live content sync.',
    tags: ['Express', 'Railway', 'Admin CMS', 'Glassmorphism'],
    img: 'assets/screenshots/bokeh-hero.png',
    video: 'assets/videos/bokeh-walkthrough.mp4',
    link: 'https://luxebybokeh.com',
    github: '',
    featured: true,
    status: 'Live'
  },
  {
    id: 'jezzob',
    title: 'HIPAA Patient Platform',
    desc: 'Patient intake, scheduling, and progress-tracking platform for JEZZOB Behavioral Health, a residential behavioral health facility in Phoenix, AZ serving 3 clinical teams and 1,200+ active patients with JWT/RBAC access control.',
    shortDesc: 'Patient intake, scheduling, and progress-tracking platform for JEZZOB Behavioral Health.',
    tags: ['Node.js', 'PostgreSQL', 'AWS', 'Docker'],
    img: 'assets/screenshots/jezzob-hero.png',
    video: '',
    link: 'https://jezzobhealthcare.org',
    github: '',
    featured: false,
    status: 'Live'
  },
  {
    id: 'cadens',
    title: 'Cadens Health & Wellness',
    desc: 'Serverless backend on AWS Lambda and API Gateway handling referral intake and appointment coordination for a behavioral health residential provider in Laveen, AZ, across 3 facility locations, with Twilio-powered SMS and email workflows.',
    shortDesc: 'Serverless backend handling referral intake and appointment coordination.',
    tags: ['AWS Lambda', 'API Gateway', 'Twilio', 'PostgreSQL'],
    img: 'assets/screenshots/cadens-hero.png',
    video: '',
    link: 'https://cadenshealth.com',
    github: '',
    featured: false,
    status: 'Live'
  },
  {
    id: 'carescrubs',
    title: 'CareScrubs Uniforms',
    desc: 'Production e-commerce platform built from scratch for a Chandler, AZ medical apparel brand founded by Dr. Georgette Quie, with Stripe payment processing and webhook-based order confirmation.',
    shortDesc: 'Production e-commerce platform with Stripe payments.',
    tags: ['React', 'Node.js', 'Express', 'Stripe'],
    img: 'assets/screenshots/carescrubs-hero.png',
    video: '',
    link: 'https://carescrubsuniforms.com',
    github: '',
    featured: false,
    status: 'Live'
  },
  {
    id: 'dawnpodcast',
    title: 'Dawn Podcast FM TV',
    desc: 'Low-latency live streaming platform using WebRTC peer-to-peer media pipelines with STUN-based signaling, live chat, and reactions. Flask backend, React frontend.',
    shortDesc: 'Low-latency live streaming platform using WebRTC.',
    tags: ['WebRTC', 'Socket.IO', 'Flask', 'React'],
    img: '',
    video: '',
    link: '',
    github: 'https://github.com/idrisp1/DawnpodcastFMTV',
    featured: false,
    status: 'Open Source'
  },
  {
    id: 'mtn',
    title: 'Enterprise AI Support Chatbot',
    desc: 'Conversational AI on Microsoft Copilot Studio and Azure AI resolving airtime, Mobile Money, and data-usage inquiries in production at MTN Cameroon.',
    shortDesc: 'Conversational AI on Microsoft Copilot Studio and Azure AI, deployed at MTN Cameroon.',
    tags: ['Copilot Studio', 'Azure AI', 'LLM', 'Webhooks'],
    img: '',
    video: '',
    link: '',
    github: '',
    featured: false,
    status: 'Deployed at MTN'
  }
];

const DEFAULT_AI_SYSTEMS = [
  { title: 'Model Training', desc: 'Fine-tuning and from-scratch training workflows for task-specific language models, deployed and tracked on a remote RunPod GPU pod through my own training dashboard: live loss curve, GPU/VRAM usage, and real spend, while training runs.', badge: 'Verified: Live demo', badgeType: 'real', video: 'assets/videos/idris-model-training-runpod-walkthrough.mp4' },
  { title: 'RunPod Deployment', desc: 'A self-built MLOps dashboard: dataset uploads, cost estimation, and GPU pods deployed and monitored directly through RunPod’s own API, plus one-click push of trained models to HuggingFace.', badge: 'Verified: Live demo', badgeType: 'real', video: 'assets/videos/idris-training-dashboard-walkthrough.mp4' },
  { title: 'AI Agents & Orchestration', desc: 'A self-built, VS Code-style AI development environment: multi-provider model routing, a DECIDE, ACT, REFLECT agent loop, and human-in-the-loop approval gates on every workspace-changing action.', badge: 'Verified: Live demo', badgeType: 'real', video: 'assets/videos/idris-orchestrator-walkthrough.mp4' },
  { title: 'Backend & API Integration', desc: 'Event-driven microservices on AWS Lambda and SQS processing 50,000+ monthly transactions at 99.97% uptime, plus REST and GraphQL APIs, webhooks, and Stripe/Twilio integrations.', badge: 'Verified: Freelance clients', badgeType: 'real', video: '' }
];

const DEFAULT_EXPERIENCE = [
  {
    role: 'Application Developer',
    company: 'JEZZOB Behavioral Health LLC',
    dates: 'Oct 2022 - Apr 2026',
    bullets: [
      'Owned end-to-end development of a HIPAA-compliant patient intake, scheduling, and progress-tracking platform serving 3 clinical teams and 1,200+ active patients.',
      'Reduced average API response time by 35% with composite-indexed PostgreSQL queries and server-side pagination.',
      'Implemented JWT and RBAC authentication across 5 user roles, passing an internal security audit with zero critical findings.',
      'Containerized backend services with Docker on AWS EC2, cutting deployment time from about 3 hours to 25 minutes.'
    ]
  },
  {
    role: 'Software Engineer',
    company: 'Independent Contractor, Freelance',
    dates: 'Jan 2020 - Present',
    bullets: [
      'Delivered 8+ full-stack production systems across healthcare, fintech, SaaS, and e-commerce; 3 platforms reached 10,000+ monthly active users within 6 months of launch.',
      'Cut average API latency from 820ms to 310ms (62% reduction) with Redis write-through caching.',
      'Designed an event-driven microservices architecture on AWS Lambda and SQS processing 50,000+ monthly transactions at 99.97% uptime.',
      'Built an OAuth 2.0 and JWT authentication system with refresh-token rotation that passed a third-party HIPAA security review on first submission.'
    ]
  },
  {
    role: 'Full-Stack Engineer (Contract)',
    company: 'CareScrubs Uniforms',
    dates: 'Feb 2019 - Nov 2019',
    bullets: [
      'Built a production e-commerce platform from scratch, handling product catalog, cart, and checkout flows, launched within 5 months.',
      'Integrated Stripe payment processing with webhook-based order confirmation and idempotent transaction handling.',
      'Optimized frontend bundle size and image delivery for a sub-2-second first contentful paint on mobile, a 45% improvement.'
    ]
  },
  {
    role: 'AI Software Engineer / AI Solutions Developer',
    company: 'MTN Cameroon',
    dates: 'Jan 2018 - Jan 2021',
    bullets: [
      'Analyzed 500K+ monthly support tickets, confirming 70-80% were automatable, and secured leadership buy-in.',
      'Deployed a production AI chatbot using Microsoft Copilot Studio and Azure AI services.',
      'Reduced tier-1 handle time by 35% within 6 months of go-live, integrating real-time webhooks.'
    ]
  }
];

const DEFAULT_EDUCATION = [
  { school: 'Grand Canyon University', degree: 'M.S., Computer Science', dates: 'In progress, Aug 2025 to present' },
  { school: 'University of Buea, Cameroon', degree: 'B.S., Computer Science', dates: 'Oct 2018 to Oct 2022' }
];

const DEFAULT_CERTIFICATIONS = [
  { name: 'Google Cloud Certified, Professional Cloud Developer' }
];

const DEFAULT_CONTACT_INFO = {
  email: 'quiendum@gmail.com',
  phone: '480-562-7514',
  location: 'Phoenix, AZ, USA',
  linkedin: 'linkedin.com/in/idris-paul-k-637185335'
};

const DEFAULT_REFERENCES = [
  { quote: 'Booking used to be all phone tag and DMs. Now clients book themselves and I manage everything from one dashboard.', org: "Peggy's Locs and Dreads" },
  { quote: 'The site looks and feels premium, and I can update products and inventory myself without calling anyone.', org: 'Luxe By Bokeh' },
  { quote: 'Checkout is fast and just works. The Stripe integration never gave us a single issue at launch.', org: 'CareScrubs Uniforms' },
  { quote: "Patient intake used to be a bottleneck. It isn't anymore, and staff access is properly controlled by role.", org: 'JEZZOB Behavioral Health' },
  { quote: 'Referrals and appointment reminders go out automatically now. That alone saved our front desk hours every week.', org: 'Cadens Health & Wellness' }
];

const DEFAULT_SECTION_VISIBILITY = {
  featured: true,
  projects: true,
  aiSystems: true,
  experience: true,
  education: true,
  references: true,
  contact: true
};

function defaultContent() {
  return {
    'idris-profile': JSON.stringify(DEFAULT_PROFILE),
    'idris-stats': JSON.stringify(DEFAULT_STATS),
    'idris-projects': JSON.stringify(DEFAULT_PROJECTS),
    'idris-ai-systems': JSON.stringify(DEFAULT_AI_SYSTEMS),
    'idris-experience': JSON.stringify(DEFAULT_EXPERIENCE),
    'idris-education': JSON.stringify(DEFAULT_EDUCATION),
    'idris-certifications': JSON.stringify(DEFAULT_CERTIFICATIONS),
    'idris-contact-info': JSON.stringify(DEFAULT_CONTACT_INFO),
    'idris-references': JSON.stringify(DEFAULT_REFERENCES),
    'idris-section-visibility': JSON.stringify(DEFAULT_SECTION_VISIBILITY)
  };
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function writeFileAtomic(filePath, contents) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, contents);
  fs.renameSync(tempPath, filePath);
}

function readRawContent() {
  ensureDataDir();
  if (!fs.existsSync(CONTENT_FILE)) {
    const seeded = { data: defaultContent(), updatedAt: new Date().toISOString() };
    writeFileAtomic(CONTENT_FILE, JSON.stringify(seeded, null, 2));
    return seeded;
  }

  try {
    const raw = fs.readFileSync(CONTENT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.data !== 'object') {
      throw new Error('Malformed content file.');
    }
    return parsed;
  } catch {
    const seeded = { data: defaultContent(), updatedAt: new Date().toISOString() };
    writeFileAtomic(CONTENT_FILE, JSON.stringify(seeded, null, 2));
    return seeded;
  }
}

export function getContent() {
  const stored = readRawContent();
  const data = defaultContent();
  for (const key of CONTENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(stored.data, key) && typeof stored.data[key] === 'string') {
      data[key] = stored.data[key];
    }
  }
  return { data, updatedAt: stored.updatedAt || new Date().toISOString() };
}

// `patch` must already be limited to CONTENT_KEYS + size-checked by the caller (route validation).
export function updateContent(patch) {
  const current = readRawContent();
  const nextData = { ...defaultContent(), ...current.data, ...patch };
  const next = { data: nextData, updatedAt: new Date().toISOString() };
  writeFileAtomic(CONTENT_FILE, JSON.stringify(next, null, 2));
  return next;
}
