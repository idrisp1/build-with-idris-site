// Service catalog: the single source of truth for service pages, internal links
// and structured data. Every service here is a VERIFIED offering:
//   - agencyTitle  -> matches a category listed in the live "Agency" section
//                     (performed by the owner's local agency app)
//   - engineering  -> freelance engineering backed by projects/experience
// Copy deliberately contains no prices, timelines, guarantees or statistics:
// figures are pulled live from the owner-edited experience/projects content at
// render time (see `proof.experienceMatch`), so pages can never drift from, or
// exaggerate, what the profile itself says.
//
// Page-count decisions (why 7 pages, what was merged) are documented in
// seo_engine/keyword_research/keyword_coverage_network.md.

export const SERVICES = [
  {
    slug: 'website-design-development',
    name: 'Website Design & Development',
    agencyTitle: 'Website Design & Development',
    primaryKeyword: 'website design Phoenix',
    secondaryKeywords: ['web developer Phoenix', 'website redesign', 'booking website development', 'ecommerce website development', 'website maintenance', 'hire web developer'],
    title: 'Website Design & Development in Phoenix, AZ | Idris Paul Kwaya',
    metaDescription: 'Custom websites, online booking and e-commerce for Phoenix-area and U.S. small businesses. Built and maintained by Idris Paul Kwaya. See live client sites.',
    h1: 'Website design and development for small businesses',
    lead: 'I design and build custom websites that do real work for a business: take bookings, sell products, collect leads, and let the owner update content without calling a developer. Every project below is a live site I built.',
    audience: [
      'Local and small businesses that need a professional website, or a redesign of one that no longer represents them',
      'Service businesses that want customers to book online instead of by phone or direct message',
      'Product businesses that need a store with reliable online payments',
      'Owners who want to edit their own content from an admin panel'
    ],
    included: [
      { title: 'New websites', desc: 'Custom-designed sites built around your services, your customers and the action you want visitors to take.' },
      { title: 'Redesign and modernization', desc: 'Rebuilding an outdated site so it looks current, loads fast on phones and is easier to manage.' },
      { title: 'Online booking and business tools', desc: 'Booking flows and an owner dashboard, like the platform behind Peggy\'s Locs and Dreads.' },
      { title: 'E-commerce', desc: 'Product catalog, cart and checkout with Stripe payments and webhook-based order confirmation, as built for CareScrubs Uniforms.' },
      { title: 'Owner admin panels', desc: 'Edit products, inventory, photos and page content yourself, with changes appearing live, as on Luxe By Bokeh.' },
      { title: 'Maintenance and performance', desc: 'Ongoing updates, speed optimization and broken-link troubleshooting for an existing site.' }
    ],
    process: [
      { title: 'Consultation', desc: 'We talk through your business, your customers and what the site needs to achieve.' },
      { title: 'Design and build', desc: 'I design and develop the site, sharing progress so you can give feedback before launch.' },
      { title: 'Launch on your domain', desc: 'Production deployment on your custom domain, with HTTPS and search-engine basics in place.' },
      { title: 'Ongoing support', desc: 'Maintenance and improvements when you need them.' }
    ],
    proof: { projects: ['peggy', 'bokeh', 'carescrubs', 'jezzob'], experienceMatch: ['CareScrubs'] },
    tech: ['Node.js', 'Express', 'React', 'Stripe', 'Server-Sent Events', 'Railway'],
    faqs: [
      { q: 'Do you only work with businesses in Phoenix?', a: 'No. I am based in Phoenix, Arizona and work with local businesses in person, and with clients anywhere in the United States remotely.' },
      { q: 'Can I update my website myself after launch?', a: 'Yes, if you need to. Sites such as Luxe By Bokeh and Peggy\'s Locs and Dreads include an admin panel where the owner edits products, content and images directly, with changes appearing on the live site immediately.' },
      { q: 'Can you add online booking or payments?', a: 'Yes. I have built a booking and business-management platform for a mobile hair loc business and a Stripe-powered checkout with webhook-based order confirmation for a medical apparel brand.' },
      { q: 'How much does a website cost?', a: 'It depends on scope: the number of pages, whether you need booking, e-commerce or an admin panel, and integrations. I give a quote after a short consultation about what your business needs.' },
      { q: 'Can you redesign my existing website?', a: 'Yes. Redesign and modernization is part of this service, along with fixing performance problems and broken links on an existing site.' }
    ],
    related: ['seo-digital-marketing', 'custom-software-development', 'ai-automation']
  },
  {
    slug: 'custom-software-development',
    name: 'Custom Software & Backend Development',
    engineering: true,
    primaryKeyword: 'custom software development Phoenix',
    secondaryKeywords: ['backend developer', 'API development', 'HIPAA compliant software development', 'AWS Lambda developer', 'healthcare software developer', 'Node.js developer'],
    title: 'Custom Software & Backend Development | Idris Paul Kwaya',
    metaDescription: 'Custom web apps, APIs and cloud backends, including HIPAA-compliant healthcare platforms and AWS serverless systems. Phoenix-based, remote across the U.S.',
    h1: 'Custom software and backend development',
    lead: 'When an off-the-shelf tool does not fit, I design and build the application itself: secure patient platforms, serverless backends, APIs and integrations that keep running in production.',
    audience: [
      'Healthcare and behavioral health organizations that handle sensitive patient data',
      'Startups and businesses that need an application, API or backend built or rescued',
      'Teams whose existing backend is slow, hard to deploy or does not scale'
    ],
    included: [
      { title: 'Web applications', desc: 'Full-stack applications for intake, scheduling, tracking and internal operations.' },
      { title: 'APIs and integrations', desc: 'REST and GraphQL APIs, webhooks, and integrations such as Stripe and Twilio.' },
      { title: 'Serverless and cloud backends', desc: 'Event-driven systems on AWS Lambda, API Gateway and SQS, and containerized services with Docker on EC2.' },
      { title: 'Security and access control', desc: 'JWT and role-based access control, OAuth 2.0 with refresh-token rotation, built for compliance-sensitive environments.' },
      { title: 'Performance work', desc: 'Query indexing, pagination and caching to bring response times down.' },
      { title: 'Real-time features', desc: 'Live updates with Server-Sent Events, WebRTC media and Socket.IO messaging.' }
    ],
    process: [
      { title: 'Discovery', desc: 'Map the workflow, users, roles and data the system has to handle.' },
      { title: 'Architecture', desc: 'Choose the simplest architecture that meets security, scale and budget needs.' },
      { title: 'Build and test', desc: 'Iterative development with working releases you can review.' },
      { title: 'Deploy and hand over', desc: 'Production deployment, documentation, and support after launch.' }
    ],
    proof: { projects: ['jezzob', 'cadens', 'dawnpodcast', 'carescrubs'], experienceMatch: ['JEZZOB', 'Independent Contractor'] },
    tech: ['Node.js', 'PostgreSQL', 'AWS Lambda', 'API Gateway', 'SQS', 'Docker', 'Redis', 'Flask', 'React'],
    faqs: [
      { q: 'Can you build HIPAA-compliant software?', a: 'I have built and owned a HIPAA-compliant patient intake, scheduling and progress-tracking platform for a behavioral health provider, and an authentication system that passed a third-party HIPAA security review. Full compliance also depends on your organization\'s policies, agreements and hosting, which we review together.' },
      { q: 'Do you work on existing codebases?', a: 'Yes. Much of backend work is improving what exists: speeding up slow queries and APIs, adding access control, containerizing deployments or adding integrations.' },
      { q: 'Which technologies do you use?', a: 'Mostly Node.js and Express, PostgreSQL, React, and AWS (Lambda, API Gateway, SQS, EC2), plus Python and Flask where they fit. I am a Google Cloud Certified Professional Cloud Developer.' },
      { q: 'Do you work remotely?', a: 'Yes. I am based in Phoenix, Arizona and work with clients across the United States.' }
    ],
    related: ['ai-development', 'website-design-development', 'ai-automation']
  },
  {
    slug: 'ai-development',
    name: 'AI & LLM Development',
    engineering: true,
    primaryKeyword: 'AI developer Phoenix',
    secondaryKeywords: ['hire AI engineer', 'custom AI chatbot development', 'LLM integration', 'AI agent development', 'Microsoft Copilot Studio developer', 'LLM fine-tuning'],
    title: 'AI Developer in Phoenix: Chatbots, LLM Apps & Agents',
    metaDescription: 'Hire an AI Systems Engineer for production AI: support chatbots, LLM integrations, AI agents and model fine-tuning on GPUs. Real deployments, live demos.',
    h1: 'AI development: chatbots, LLM applications and agents',
    lead: 'I build AI systems that run in production, not prototypes: a support chatbot deployed at MTN Cameroon, my own multi-provider AI development environment, and an MLOps dashboard for training and deploying models on GPU pods. Each is demonstrated on this site.',
    audience: [
      'Companies that want an AI assistant to handle routine customer or staff questions',
      'Product teams adding LLM features or agents to an existing application',
      'Teams that need a model fine-tuned, evaluated and deployed'
    ],
    included: [
      { title: 'AI chatbots and assistants', desc: 'Conversational AI on Microsoft Copilot Studio and Azure AI, or custom LLM-backed assistants, integrated with your systems through webhooks and APIs.' },
      { title: 'LLM integration', desc: 'Adding language-model features to products, with multi-provider model routing so you are not locked to one vendor.' },
      { title: 'AI agents and orchestration', desc: 'Agent loops that plan, act and check their own work, with human approval gates on any action that changes real systems.' },
      { title: 'Model training and fine-tuning', desc: 'Fine-tuning and training workflows on remote RunPod GPU pods, with live loss curves, GPU usage and spend tracking.' },
      { title: 'MLOps and deployment', desc: 'Dataset uploads, cost estimation, GPU deployment and monitoring, and publishing trained models to Hugging Face.' }
    ],
    process: [
      { title: 'Use-case review', desc: 'Confirm where AI genuinely helps, using your real data, tickets or workflows, and where it does not.' },
      { title: 'Prototype on real data', desc: 'A working version tested against real examples before anything goes to users.' },
      { title: 'Production integration', desc: 'Connect the AI to your systems with safeguards, logging and human review where needed.' },
      { title: 'Measure and improve', desc: 'Track the outcomes that matter to you and iterate.' }
    ],
    proof: { projects: ['mtn'], experienceMatch: ['MTN'], aiSystems: true },
    tech: ['Microsoft Copilot Studio', 'Azure AI', 'LLMs', 'RunPod', 'Hugging Face', 'Python', 'Node.js'],
    faqs: [
      { q: 'What does an AI Systems Engineer do?', a: 'I design, build and deploy the whole system around an AI model: the prompts and agents, the integrations with your data and tools, the infrastructure it runs on, and the safeguards that keep it reliable in production.' },
      { q: 'Have you deployed an AI chatbot in production?', a: 'Yes. At MTN Cameroon I analyzed support ticket volume, then deployed a production chatbot on Microsoft Copilot Studio and Azure AI that handled airtime, Mobile Money and data-usage inquiries, integrated through real-time webhooks.' },
      { q: 'Can you fine-tune a model for my use case?', a: 'Yes. I run fine-tuning and training workflows on RunPod GPU pods through my own training dashboard, which tracks loss, GPU usage and cost while the run is live. A walkthrough video is on the homepage.' },
      { q: 'Will an AI agent take actions without approval?', a: 'Not by default. The agent systems I build put human approval gates on any action that changes real files, data or accounts.' },
      { q: 'Do you work with clients outside Phoenix?', a: 'Yes, remotely anywhere in the United States.' }
    ],
    related: ['ai-automation', 'custom-software-development', 'ai-data-annotation']
  },
  {
    slug: 'ai-automation',
    name: 'Business Process Automation & AI Solutions',
    agencyTitle: 'Business Process Automation & AI Solutions',
    primaryKeyword: 'AI automation for small businesses',
    secondaryKeywords: ['business process automation services', 'workflow automation', 'automate repetitive business tasks', 'appointment reminder automation', 'automated reporting'],
    title: 'AI Automation for Small Businesses | Idris Paul Kwaya',
    metaDescription: 'Automate repetitive work like reminders, follow-ups, data entry and reporting with AI and workflow automation. Phoenix-based, serving U.S. businesses.',
    h1: 'AI and workflow automation for small businesses',
    lead: 'Many businesses lose hours every week to the same manual steps: sending reminders, chasing follow-ups, copying data between tools, compiling reports. I automate that work so your team can spend time on customers instead.',
    audience: [
      'Small and local businesses whose staff repeat the same manual tasks every day',
      'Front desks and operations teams handling referrals, appointments and reminders',
      'Owners who want regular reports without assembling them by hand'
    ],
    included: [
      { title: 'Workflow automation', desc: 'Connecting the tools you already use so data moves between them without retyping.' },
      { title: 'Repetitive task automation', desc: 'Automating routine, rule-based steps such as reminders, notifications and follow-ups.' },
      { title: 'SMS and email workflows', desc: 'Automated messages triggered by real events, as built with Twilio for a behavioral health provider\'s referral and appointment process.' },
      { title: 'AI agents for business tasks', desc: 'AI agents that research, draft or sort information, with a person approving anything important.' },
      { title: 'Automated data processing and reporting', desc: 'Scheduled reports and dashboards built from your own data.' }
    ],
    process: [
      { title: 'Map the workflow', desc: 'Walk through the task step by step to find what can safely be automated.' },
      { title: 'Automate the highest-value step first', desc: 'Start where the time savings are largest and the risk is lowest.' },
      { title: 'Run alongside your team', desc: 'Check the automation against real cases before relying on it.' },
      { title: 'Extend', desc: 'Add the next workflow once the first one is proven.' }
    ],
    proof: { projects: ['cadens', 'mtn'], experienceMatch: ['MTN'] },
    tech: ['Twilio', 'AWS Lambda', 'Node.js', 'Python', 'LLMs', 'Webhooks'],
    faqs: [
      { q: 'How can a small business automate repetitive tasks?', a: 'Start by listing tasks that follow the same steps every time, such as appointment reminders, follow-up emails, moving form submissions into a spreadsheet or CRM, or weekly reports. Those are usually the safest and most valuable to automate first. I help map them and build the automation.' },
      { q: 'What is the difference between this and AI development?', a: 'This service focuses on saving your team time on existing business processes. If you need a custom AI product, chatbot or model, see AI & LLM Development.' },
      { q: 'Will automation replace my staff?', a: 'The goal is to remove repetitive steps, not people. Automations I build keep a person in charge of decisions that matter.' },
      { q: 'Do you work with businesses outside Phoenix?', a: 'Yes. I work with Phoenix-area businesses in person and with U.S. businesses remotely.' }
    ],
    related: ['ai-development', 'document-processing', 'custom-software-development']
  },
  {
    slug: 'seo-digital-marketing',
    name: 'SEO, Digital Marketing & Business Research',
    agencyTitle: 'SEO & Online Visibility',
    alsoCovers: ['Digital Marketing & Advertising', 'Business Research & Intelligence'],
    primaryKeyword: 'SEO services Phoenix',
    secondaryKeywords: ['local SEO Phoenix', 'SEO audit', 'digital marketing Phoenix', 'Google Ads management', 'competitor research', 'lead generation'],
    title: 'SEO & Digital Marketing Services in Phoenix | Idris Paul Kwaya',
    metaDescription: 'SEO audits, keyword research, on-page SEO, ad campaigns, competitor research and lead generation for Phoenix-area and U.S. small businesses.',
    h1: 'SEO, digital marketing and business research',
    lead: 'Being findable is part of having a website that works. I help small businesses understand how customers search, fix what is holding their site back, and run marketing that can be measured, combining a developer\'s view of the site with AI-assisted research.',
    audience: [
      'Local businesses that are hard to find on Google or Bing',
      'Owners who want to know what competitors are doing online',
      'Businesses that want measured advertising campaigns or qualified leads'
    ],
    included: [
      { title: 'SEO audits', desc: 'Technical and on-page review of your site: crawlability, titles, structure, speed, structured data and content gaps.' },
      { title: 'Keyword research', desc: 'What your customers actually search for, organized by intent and mapped to the right pages.' },
      { title: 'On-page optimization', desc: 'Titles, descriptions, headings, internal links and content improvements.' },
      { title: 'Competitor SEO analysis', desc: 'Where competitors are visible and you are not.' },
      { title: 'Digital marketing and advertising', desc: 'Paid campaign strategy, audience targeting, and ongoing campaign monitoring and optimization.' },
      { title: 'Business research and lead generation', desc: 'Company, market and product research, business information verification, and lead lists.' }
    ],
    process: [
      { title: 'Audit', desc: 'Measure where the site and your visibility stand today.' },
      { title: 'Prioritize', desc: 'Fix the issues with the biggest impact first.' },
      { title: 'Implement', desc: 'Make the changes, or hand your developer a clear list.' },
      { title: 'Measure', desc: 'Track impressions, clicks and leads over time with Search Console and analytics.' }
    ],
    proof: { projects: [], experienceMatch: [], note: 'This website runs its own automated search-monitoring system (Google Search Console, Bing Webmaster Tools and IndexNow), built and maintained by me.' },
    tech: ['Google Search Console', 'Bing Webmaster Tools', 'IndexNow', 'Schema.org structured data'],
    faqs: [
      { q: 'Can you guarantee first-page rankings?', a: 'No, and you should be wary of anyone who does. Search engines decide rankings. What I can do is remove technical problems, make your pages clearly match what customers search for, and measure the results honestly.' },
      { q: 'How long does SEO take to show results?', a: 'It varies with competition and the state of the site. Technical fixes can be picked up as soon as pages are recrawled, while content and authority build over months. Results are tracked in Search Console so you can see real progress.' },
      { q: 'Do you also run paid ads?', a: 'Yes. Paid advertising campaigns, audience targeting and ongoing campaign optimization are part of the agency\'s digital marketing service.' },
      { q: 'Do you work outside Phoenix?', a: 'Yes. Local SEO focuses on your own service area wherever you are in the U.S., and I work with clients remotely.' }
    ],
    related: ['website-design-development', 'ai-automation']
  },
  {
    slug: 'document-processing',
    name: 'Document Processing & Data Management',
    agencyTitle: 'Document Processing & Data Management',
    primaryKeyword: 'PDF data extraction service',
    secondaryKeywords: ['invoice processing service', 'PDF to Excel conversion', 'data entry services', 'data cleaning services', 'document classification'],
    title: 'PDF Data Extraction & Invoice Processing | Idris Paul Kwaya',
    metaDescription: 'Turn PDFs, invoices and receipts into clean spreadsheets. Data extraction, PDF-to-Excel/CSV conversion, cleaning and validation with human checks.',
    h1: 'Document processing and data management',
    lead: 'If someone on your team retypes invoices, receipts or PDF reports into spreadsheets, that work can be done faster and more consistently. I extract, convert, clean and validate document data, using AI-assisted tooling combined with human quality control.',
    audience: [
      'Small businesses and bookkeepers handling stacks of invoices and receipts',
      'Teams that receive data as PDFs but need it in Excel, CSV or a database',
      'Anyone with messy spreadsheets that need cleaning and organizing'
    ],
    included: [
      { title: 'Invoice and receipt processing', desc: 'Pulling vendors, dates, line items and totals into structured records.' },
      { title: 'PDF data extraction', desc: 'Text and tables extracted from PDF documents.' },
      { title: 'PDF to Excel and CSV conversion', desc: 'Documents converted into spreadsheets ready to use.' },
      { title: 'Data entry and extraction', desc: 'Getting information out of documents and into the system where you need it.' },
      { title: 'Data cleaning and organization', desc: 'De-duplicating, standardizing and organizing existing data.' },
      { title: 'Document classification and validation', desc: 'Sorting documents by type and automatically checking extracted values for errors.' }
    ],
    process: [
      { title: 'Sample review', desc: 'Look at a sample of your documents and agree on the output format.' },
      { title: 'Extraction', desc: 'Process the documents with AI-assisted tooling.' },
      { title: 'Validation', desc: 'Automated checks plus human review of anything uncertain.' },
      { title: 'Delivery', desc: 'Clean files in the agreed format, with any exceptions flagged.' }
    ],
    proof: { projects: [], experienceMatch: [] },
    tech: ['Python', 'Excel', 'CSV', 'PDF tooling'],
    faqs: [
      { q: 'What formats can you deliver?', a: 'Spreadsheets (Excel or CSV) or structured data for import into your own system. We agree on the exact layout from a sample before processing everything.' },
      { q: 'How do you make sure the data is accurate?', a: 'Extraction is followed by automated validation checks, and anything uncertain is flagged for human review instead of being guessed.' },
      { q: 'Can this be automated on an ongoing basis?', a: 'Yes. Recurring document flows can be turned into an automated process. See Business Process Automation.' }
    ],
    related: ['ai-automation', 'ai-data-annotation']
  },
  {
    slug: 'ai-data-annotation',
    name: 'AI Data Annotation & Evaluation',
    agencyTitle: 'AI-Powered Data Annotation & Evaluation',
    primaryKeyword: 'data annotation services',
    secondaryKeywords: ['image annotation services', 'bounding box labeling', 'text classification labeling', 'named entity recognition annotation', 'audio transcription', 'AI response evaluation'],
    title: 'AI Data Annotation & Evaluation Services | Idris Paul Kwaya',
    metaDescription: 'Image, text, audio and video annotation for machine learning, plus AI response evaluation. Classification, bounding boxes, NER, with quality checks.',
    h1: 'AI data annotation and evaluation',
    lead: 'Models are only as good as the data they learn from. I provide labelled training data and evaluation of AI outputs, combining AI-assisted labelling with automated quality validation and human review, from an engineer who also trains and deploys models.',
    audience: [
      'Machine learning teams and AI startups that need labelled training data',
      'Companies evaluating the quality of an AI system\'s responses',
      'Researchers who need transcription or annotation of audio and video'
    ],
    included: [
      { title: 'Image annotation', desc: 'Image classification, object detection and bounding-box labeling.' },
      { title: 'Text annotation', desc: 'Text classification, sentiment analysis and named entity recognition (NER).' },
      { title: 'Audio and video', desc: 'Audio transcription and video annotation.' },
      { title: 'AI response evaluation', desc: 'Rating and reviewing model outputs against your guidelines.' },
      { title: 'Automated quality validation', desc: 'Consistency checks across labels before delivery.' }
    ],
    process: [
      { title: 'Guidelines', desc: 'Agree on label definitions, edge cases and the output format your pipeline expects.' },
      { title: 'Pilot batch', desc: 'Label a small batch for you to check before scaling up.' },
      { title: 'Production labelling', desc: 'AI-assisted labelling with human review.' },
      { title: 'Quality validation', desc: 'Automated checks and spot reviews before delivery.' }
    ],
    proof: { projects: [], experienceMatch: [], aiSystems: true },
    tech: ['Python', 'Machine learning datasets', 'LLM evaluation'],
    faqs: [
      { q: 'What is data annotation?', a: 'Data annotation is labelling raw data (images, text, audio or video) so a machine learning model can learn from it, for example drawing boxes around objects in images or tagging names and places in text.' },
      { q: 'How is quality controlled?', a: 'Labels follow written guidelines agreed up front, a pilot batch is reviewed with you first, and automated validation checks catch inconsistent labels before delivery.' },
      { q: 'Why work with an engineer for annotation?', a: 'Because I also train and fine-tune models, I understand how label quality and consistency affect training results, and can deliver data in the format your training pipeline expects.' }
    ],
    related: ['ai-development', 'document-processing']
  }
];

export const SERVICE_BY_SLUG = Object.fromEntries(SERVICES.map((s) => [s.slug, s]));

// Project -> primary service (for "related service" links on project pages).
export const PROJECT_SERVICE = {
  peggy: 'website-design-development',
  bokeh: 'website-design-development',
  carescrubs: 'website-design-development',
  jezzob: 'custom-software-development',
  cadens: 'ai-automation',
  dawnpodcast: 'custom-software-development',
  mtn: 'ai-development'
};

// Project -> experience entries that describe the same work (matched by company
// name substring against the live experience content).
export const PROJECT_EXPERIENCE = {
  jezzob: ['JEZZOB'],
  carescrubs: ['CareScrubs'],
  mtn: ['MTN']
};

// Agency card title (live content) -> service page, for "Learn more" links.
export function agencyServiceLinks() {
  const map = {};
  for (const s of SERVICES) {
    if (s.agencyTitle) map[s.agencyTitle] = `/services/${s.slug}`;
    for (const t of s.alsoCovers || []) map[t] = `/services/${s.slug}`;
  }
  return map;
}
