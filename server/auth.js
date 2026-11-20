const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const db = require('./db');

const SESSION_DURATION = 8 * 60 * 60 * 1000;
const COOKIE_NAME = 'luna_admin_session';
const createSession = db.prepare('INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)');
const findSession = db.prepare(`SELECT admins.id, admins.username FROM admin_sessions
  JOIN admins ON admins.id = admin_sessions.admin_id
  WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > ?`);
const deleteSession = db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?');

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algorithm, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/i.test(hash || '')) return false;
  const derived = await scrypt(password, salt, 64);
  return crypto.timingSafeEqual(derived, Buffer.from(hash, 'hex'));
}

function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function createAdminSession(adminId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DURATION;
  createSession.run(hashToken(token), adminId, expiresAt);
  return { token, expiresAt };
}
function getAdminFromSession(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return findSession.get(hashToken(token), Date.now()) || null;
}
function destroyAdminSession(token) {
  if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) deleteSession.run(hashToken(token));
}
function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
  }
  return cookies;
}
function requireAdmin(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const admin = getAdminFromSession(token);
  if (!admin) return res.status(401).json({ error: 'برای دسترسی باید وارد حساب مدیر شوید.' });
  req.admin = admin;
  req.adminToken = token;
  next();
}
function setSessionCookie(res, token) {
  const secure = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: SESSION_DURATION });
}
function clearSessionCookie(res) {
  const secure = process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure, sameSite: 'strict', path: '/' });
}
module.exports = { hashPassword, verifyPassword, createAdminSession, getAdminFromSession, destroyAdminSession, requireAdmin, setSessionCookie, clearSessionCookie, SESSION_DURATION, COOKIE_NAME };
