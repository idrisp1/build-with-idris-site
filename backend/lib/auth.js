import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const SESSION_COOKIE = 'idris_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sessions = new Map();

function sweepExpiredSessions() {
  const now = Date.now();
  for (const [id, expiresAt] of sessions.entries()) {
    if (expiresAt < now) sessions.delete(id);
  }
}

setInterval(sweepExpiredSessions, 60_000).unref();

export function createAdminAuth({ username, passwordHash, cookieSecure }) {
  if (!username) {
    throw new Error('ADMIN_USERNAME is required.');
  }
  if (!passwordHash) {
    throw new Error('ADMIN_PASSWORD_HASH is required.');
  }

  async function verifyCredentials(candidateUsername, password) {
    if (typeof candidateUsername !== 'string' || typeof password !== 'string') return false;
    if (candidateUsername.trim().toLowerCase() !== username.toLowerCase()) return false;
    return bcrypt.compare(password, passwordHash);
  }

  function issueSession(res) {
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, Date.now() + SESSION_TTL_MS);
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      signed: true,
      maxAge: SESSION_TTL_MS
    });
  }

  function clearSession(req, res) {
    const sessionId = req.signedCookies?.[SESSION_COOKIE];
    if (sessionId) sessions.delete(sessionId);
    res.clearCookie(SESSION_COOKIE);
  }

  function isAuthenticated(req) {
    const sessionId = req.signedCookies?.[SESSION_COOKIE];
    if (!sessionId) return false;
    const expiresAt = sessions.get(sessionId);
    if (!expiresAt || expiresAt < Date.now()) {
      sessions.delete(sessionId);
      return false;
    }
    return true;
  }

  function requireAdmin(req, res, next) {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Admin authentication required.' });
      return;
    }
    next();
  }

  return { verifyCredentials, issueSession, clearSession, isAuthenticated, requireAdmin };
}
