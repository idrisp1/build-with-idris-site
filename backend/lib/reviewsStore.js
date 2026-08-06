import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');

const MAX_REVIEWS = 500;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function writeFileAtomic(filePath, contents) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, contents);
  fs.renameSync(tempPath, filePath);
}

function readReviews() {
  ensureDataDir();
  if (!fs.existsSync(REVIEWS_FILE)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReviews(reviews) {
  writeFileAtomic(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
}

export function listReviews() {
  return readReviews();
}

export function listApprovedReviews() {
  return readReviews().filter((r) => r.status === 'approved');
}

export function addReview({ name, role, text }) {
  const reviews = readReviews();
  const entry = {
    id: crypto.randomUUID(),
    name,
    role,
    text,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  reviews.unshift(entry);
  writeReviews(reviews.slice(0, MAX_REVIEWS));
  return entry;
}

export function setReviewStatus(id, status) {
  const reviews = readReviews();
  const review = reviews.find((r) => r.id === id);
  if (!review) return null;
  review.status = status;
  writeReviews(reviews);
  return review;
}

export function deleteReview(id) {
  const reviews = readReviews();
  const next = reviews.filter((r) => r.id !== id);
  const removed = next.length !== reviews.length;
  if (removed) writeReviews(next);
  return removed;
}
