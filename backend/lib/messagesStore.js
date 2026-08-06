import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

const MAX_MESSAGES = 500;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function writeFileAtomic(filePath, contents) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, contents);
  fs.renameSync(tempPath, filePath);
}

function readMessages() {
  ensureDataDir();
  if (!fs.existsSync(MESSAGES_FILE)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMessages(messages) {
  writeFileAtomic(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

export function listMessages() {
  return readMessages();
}

export function addMessage(message) {
  const messages = readMessages();
  const entry = {
    id: crypto.randomUUID(),
    ...message,
    createdAt: new Date().toISOString()
  };
  messages.unshift(entry);
  writeMessages(messages.slice(0, MAX_MESSAGES));
  return entry;
}

export function clearMessages() {
  writeMessages([]);
}
