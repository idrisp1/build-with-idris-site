// Google OAuth 2.0 (authorization-code flow) for Search Console, as an
// alternative to the service account. Connecting as the property owner gives
// full Search Console permission (e.g. sitemap submission) without changing
// service-account permissions.
//
// Security:
//  - client id/secret only from env (GOOGLE_OAUTH_CLIENT_ID / _SECRET)
//  - CSRF-safe: a random one-time `state`, expiring after 10 minutes
//  - refresh/access tokens encrypted at rest with AES-256-GCM, key derived from
//    SESSION_SECRET; never logged, never returned by any endpoint
//  - access tokens refresh automatically (googleapis), refreshed tokens are re-saved
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { config, secret } from '../config.js';
import { readJson, writeJson, remove } from '../store.js';

const TOKEN_FILE = 'secure/google-oauth.json';
const SCOPES = ['https://www.googleapis.com/auth/webmasters'];
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

export function isClientConfigured() {
  return Boolean(secret('GOOGLE_OAUTH_CLIENT_ID') && secret('GOOGLE_OAUTH_CLIENT_SECRET'));
}

export function redirectUri() {
  return `${config().origin}/api/admin/seo/google/oauth/callback`;
}

function key() {
  const s = secret('SESSION_SECRET');
  if (!s) throw new Error('SESSION_SECRET is required to encrypt OAuth tokens.');
  return crypto.createHash('sha256').update(`google-oauth-tokens:${s}`).digest();
}

export function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decrypt(box) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(box.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString('utf8'));
}

function client() {
  return new google.auth.OAuth2(secret('GOOGLE_OAUTH_CLIENT_ID'), secret('GOOGLE_OAUTH_CLIENT_SECRET'), redirectUri());
}

export function startUrl() {
  if (!isClientConfigured()) throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set.');
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  for (const [s, exp] of pendingStates) if (exp < Date.now()) pendingStates.delete(s);
  return client().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state, include_granted_scopes: true });
}

export function consumeState(state) {
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  return Boolean(exp && exp >= Date.now());
}

export function saveTokens(tokens) {
  const existing = loadTokens() || {};
  // Google only returns a refresh_token on first consent; keep the old one otherwise.
  const merged = { ...existing, ...tokens, refresh_token: tokens.refresh_token || existing.refresh_token };
  writeJson(TOKEN_FILE, { savedAt: new Date().toISOString(), box: encrypt(merged) });
}

export function loadTokens() {
  const rec = readJson(TOKEN_FILE, null);
  if (!rec?.box) return null;
  try { return decrypt(rec.box); } catch { return null; }
}

export function isConnected() {
  return Boolean(isClientConfigured() && loadTokens()?.refresh_token);
}

export async function exchangeCode(code, { oauthClient = client() } = {}) {
  const { tokens } = await oauthClient.getToken(code);
  if (!tokens.refresh_token && !loadTokens()?.refresh_token) throw new Error('Google did not return a refresh token; remove the app at myaccount.google.com/permissions and connect again.');
  saveTokens(tokens);
  return { connected: true, scope: tokens.scope || null };
}

// Authorized client with automatic refresh; refreshed tokens are persisted.
export function authClient() {
  const tokens = loadTokens();
  if (!tokens?.refresh_token) return null;
  const c = client();
  c.setCredentials(tokens);
  c.on('tokens', (t) => saveTokens(t));
  return c;
}

export async function disconnect() {
  const tokens = loadTokens();
  if (tokens?.refresh_token) {
    try { await client().revokeToken(tokens.refresh_token); } catch { /* revoke is best-effort */ }
  }
  remove(TOKEN_FILE);
  return { connected: false };
}

export function status() {
  const rec = readJson(TOKEN_FILE, null);
  return { clientConfigured: isClientConfigured(), connected: isConnected(), connectedAt: rec?.savedAt || null, redirectUri: redirectUri() };
}
