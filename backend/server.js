import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import multer from 'multer';

import { CONTENT_KEYS, getContent, updateContent } from './lib/contentStore.js';
import { listMessages, addMessage, clearMessages } from './lib/messagesStore.js';
import { listReviews, listApprovedReviews, addReview, setReviewStatus, deleteReview } from './lib/reviewsStore.js';
import { createAdminAuth } from './lib/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
// Nested under backend/data (not a sibling backend/uploads) so both live on
// the single Railway volume mounted at backend/data. Railway only allows
// one volume per service, so uploads persist across redeploys alongside
// content.json/messages.json.
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
const INDEX_HTML = path.join(PROJECT_ROOT, 'index.html');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');

// Resolve .env relative to this file, not the process's working directory,
// so `node backend/server.js` behaves the same no matter where it's launched from.
dotenv.config({ path: path.join(__dirname, '.env') });

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
const port = Number(process.env.PORT || 8095);
const nodeEnv = String(process.env.NODE_ENV || 'development').trim();
const frontendOrigin = String(process.env.FRONTEND_ORIGIN || `http://127.0.0.1:${port}`).trim();

// A site is reachable at both the apex and www, accept whichever the
// visitor's browser actually used as the CORS origin, not just the one
// exact string in FRONTEND_ORIGIN, or admin login silently CORS-fails on
// whichever variant wasn't configured.
function buildAllowedOrigins(primary) {
  const origins = new Set([primary]);
  try {
    const url = new URL(primary);
    const altHost = url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`;
    origins.add(`${url.protocol}//${altHost}`);
  } catch {
    // primary isn't a full URL (e.g. bare host during local dev), nothing to add.
  }
  return origins;
}
const allowedOrigins = buildAllowedOrigins(frontendOrigin);

const adminUsername = String(process.env.ADMIN_USERNAME || '').trim();
const adminPasswordHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim();
const sessionSecret = String(process.env.SESSION_SECRET || '').trim();

if (!adminUsername) {
  throw new Error('ADMIN_USERNAME is required.');
}
if (!adminPasswordHash) {
  throw new Error('ADMIN_PASSWORD_HASH is required. Generate one with: node backend/scripts/hash-password.js "your-password"');
}
if (!sessionSecret) {
  throw new Error('SESSION_SECRET is required (any long random string).');
}

const adminAuth = createAdminAuth({
  username: adminUsername,
  passwordHash: adminPasswordHash,
  cookieSecure: nodeEnv === 'production'
});

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(cookieParser(sessionSecret));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' }
});

app.use('/api', apiLimiter);
app.use('/api', express.json({ limit: '2mb' }));

function sanitizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

const CONTROL_CHARS_PATTERN = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');

function sanitizeText(value, maxLength = 200) {
  const cleaned = String(value ?? '')
    .replace(CONTROL_CHARS_PATTERN, ' ')
    .replace(/[<>"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, Math.max(0, maxLength));
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ---- Server-Sent Events: pushes "something changed" to every open browser
// tab (admin or guest) so guests see admin edits without a manual refresh. ----
const eventSubscribers = new Set();

function broadcastEvent(type, payload) {
  const message = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const res of eventSubscribers) {
    res.write(message);
  }
}

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');

  eventSubscribers.add(res);
  req.on('close', () => {
    eventSubscribers.delete(res);
  });
});

// ---- Site content (admin-edited, guest-read) ----

app.get('/api/content', (_req, res) => {
  res.json(getContent());
});

app.put('/api/content', adminAuth.requireAdmin, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.data || typeof body.data !== 'object') {
    res.status(400).json({ error: 'Invalid content payload.' });
    return;
  }

  const patch = {};
  let totalSize = 0;
  for (const key of Object.keys(body.data)) {
    if (!CONTENT_KEYS.includes(key)) continue;
    const value = body.data[key];
    if (typeof value !== 'string') continue;
    if (value.length > 300_000) continue;
    totalSize += value.length;
    patch[key] = value;
  }

  if (totalSize > 2_000_000) {
    res.status(413).json({ error: 'Content payload too large.' });
    return;
  }

  const next = updateContent(patch);
  broadcastEvent('content', { updatedAt: next.updatedAt });
  res.json(next);
});

// ---- Admin auth ----

app.post('/api/admin/login', async (req, res) => {
  const username = req.body?.username;
  const password = req.body?.password;
  const ok = await adminAuth.verifyCredentials(username, password);
  if (!ok) {
    res.status(401).json({ error: 'Incorrect username or password.' });
    return;
  }
  adminAuth.issueSession(res);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  adminAuth.clearSession(req, res);
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: adminAuth.isAuthenticated(req) });
});

// ---- Uploads (admin-only): images and short video clips ----

const ALLOWED_UPLOAD_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm'
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = ALLOWED_UPLOAD_EXTENSIONS[file.mimetype] || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!(file.mimetype in ALLOWED_UPLOAD_EXTENSIONS)) {
      cb(new Error('Only JPG, PNG, WEBP, GIF images or MP4/WEBM videos are allowed.'));
      return;
    }
    cb(null, true);
  }
});

app.post('/api/uploads', adminAuth.requireAdmin, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Upload failed.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

// Real project screenshots and demo videos, committed to the repo (not
// admin-uploaded), served statically.
app.use('/assets', express.static(ASSETS_DIR, { maxAge: '7d' }));

// ---- Contact form (public write, admin-only read) ----

app.post('/api/messages', (req, res) => {
  const name = sanitizeText(req.body?.name, 80);
  const email = sanitizeEmail(req.body?.email);
  const message = sanitizeText(req.body?.message, 1000);

  if (!name || !email || !message) {
    res.status(400).json({ error: 'name, valid email, and message are required.' });
    return;
  }

  const entry = addMessage({ name, email, message });
  broadcastEvent('message', { id: entry.id });
  res.status(201).json(entry);
});

app.get('/api/messages', adminAuth.requireAdmin, (_req, res) => {
  res.json({ messages: listMessages() });
});

app.delete('/api/messages', adminAuth.requireAdmin, (_req, res) => {
  clearMessages();
  broadcastEvent('message', { cleared: true });
  res.json({ ok: true });
});

// ---- Visitor reviews (public submit + read approved, admin moderates) ----

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.post('/api/reviews', (req, res) => {
  const name = sanitizeText(req.body?.name, 80);
  const role = sanitizeText(req.body?.role, 120);
  const text = sanitizeText(req.body?.text, 600);

  if (!name || !text) {
    res.status(400).json({ error: 'name and review text are required.' });
    return;
  }

  const entry = addReview({ name, role, text });
  broadcastEvent('review', { id: entry.id });
  res.status(201).json(entry);
});

app.get('/api/reviews', (req, res) => {
  if (req.query.status === 'approved') {
    res.json({ reviews: listApprovedReviews() });
    return;
  }
  adminAuth.requireAdmin(req, res, () => {
    res.json({ reviews: listReviews() });
  });
});

app.put('/api/reviews/:id', adminAuth.requireAdmin, (req, res) => {
  const { id } = req.params;
  const status = req.body?.status;
  if (!UUID_PATTERN.test(id) || (status !== 'approved' && status !== 'pending')) {
    res.status(400).json({ error: 'Invalid id or status.' });
    return;
  }
  const updated = setReviewStatus(id, status);
  if (!updated) {
    res.status(404).json({ error: 'Review not found.' });
    return;
  }
  broadcastEvent('review', { id, status });
  res.json(updated);
});

app.delete('/api/reviews/:id', adminAuth.requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!UUID_PATTERN.test(id)) {
    res.status(400).json({ error: 'Invalid id.' });
    return;
  }
  const removed = deleteReview(id);
  if (!removed) {
    res.status(404).json({ error: 'Review not found.' });
    return;
  }
  broadcastEvent('review', { id, deleted: true });
  res.json({ ok: true });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ---- Static site (admin and guest load the exact same file/origin) ----

app.get(['/', '/index.html'], (_req, res) => {
  res.sendFile(INDEX_HTML);
});

app.use((_req, res) => {
  res.status(404).send('Not found.');
});

app.listen(port, () => {
  console.log(`Idris portfolio site + API listening on http://127.0.0.1:${port}`);
});
