import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import database from './database.js';

database.exec(`
  CREATE TABLE IF NOT EXISTS staff_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('cashier','kitchen','owner')),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS staff_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS staff_password_reset_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),
    resolved_at TEXT,
    resolved_by TEXT REFERENCES staff_users(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS staff_one_pending_password_reset
    ON staff_password_reset_requests(user_id) WHERE status = 'pending';
`);
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verify(password, encoded) {
  const [salt, hash] = encoded.split(':');
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const dummyHash = hashPassword(randomUUID());
// Bootstrap each role once. Existing accounts are never overwritten on restart.
for (const role of ['cashier', 'kitchen', 'owner']) {
  if (!database.prepare('SELECT id FROM staff_users WHERE username = ?').get(role)) {
    const title = role[0].toUpperCase() + role.slice(1);
    const password = process.env[`${role.toUpperCase()}_PASSWORD`] || `${title}@123`;
    database.prepare('INSERT INTO staff_users(id,username,password_hash,role,full_name) VALUES(?,?,?,?,?)').run(randomUUID(), role, hashPassword(password), role, `${title} User`);
  }
}
function token(req) { return req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('staff='))?.slice(6); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function publicUser(user) { return { id: user.id, username: user.username, role: user.role, fullName: user.full_name, email: user.email, phone: user.phone }; }
export function staffOnly(req, res, next) {
  const value = token(req);
  const user = value && database.prepare('SELECT u.* FROM staff_sessions s JOIN staff_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(value), Date.now());
  if (!user) return res.status(401).json({ error: 'Please sign in to your staff account' });
  req.staff = publicUser(user); next();
}
export function roles(...allowed) {
  return [staffOnly, (req, res, next) => allowed.includes(req.staff.role) ? next() : res.status(403).json({ error: 'Your account does not have permission for this action' })];
}
const attempts = new Map();
function loginLimit(req, res, next) {
  const now = Date.now();
  for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
  const key = req.ip; const item = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
  if (item.count >= 20) return res.status(429).json({ error: 'Too many failed sign-in attempts. Try again in 15 minutes.' });
  attempts.set(key, item); res.on('finish', () => { if (res.statusCode === 401) item.count++; }); next();
}
function setCookie(req, res, value, age = 28800) { res.setHeader('Set-Cookie', `staff=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${req.secure ? '; Secure' : ''}`); }
function revoke(req) { const current = token(req); if (current) database.prepare('DELETE FROM staff_sessions WHERE token_hash=?').run(digest(current)); }
function accountUser(user) {
  return { id: user.id, username: user.username, role: user.role, fullName: user.full_name, email: user.email, phone: user.phone };
}
const passwordLengthError = 'Use a password between 8 and 256 characters';
const validPassword = password => typeof password === 'string' && password.length >= 8 && password.length <= 256;
const pendingResetLimit = new Map();
function resetRequestLimit(req, res, next) {
  const now = Date.now();
  for (const [key, item] of pendingResetLimit) if (item.until <= now) pendingResetLimit.delete(key);
  const key = req.ip;
  const item = pendingResetLimit.get(key) || { count: 0, until: now + 15 * 60000 };
  if (item.count >= 10) return res.status(429).json({ error: 'Too many recovery requests. Try again in 15 minutes.' });
  item.count++;
  pendingResetLimit.set(key, item);
  next();
}
export function installAuth(app) {
  app.post('/api/staff/login', loginLimit, (req, res) => {
    const { username, password, role } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || !password || password.length > 256 || !['cashier','kitchen','owner'].includes(role)) return res.status(400).json({ error: 'Enter a username and password for this role' });
    const user = database.prepare('SELECT * FROM staff_users WHERE username=?').get(username.trim());
    const valid = verify(password, user?.password_hash || dummyHash);
    if (!user || !valid || user.role !== role) return res.status(401).json({ error: 'Incorrect username or password for this role' });
    database.prepare('DELETE FROM staff_sessions WHERE expires_at<=?').run(Date.now());
    revoke(req);
    const value = randomBytes(32).toString('hex');
    database.prepare('INSERT INTO staff_sessions VALUES(?,?,?)').run(digest(value), user.id, Date.now() + 8 * 3600000);
    setCookie(req, res, value); res.set('Cache-Control', 'no-store').json({ user: publicUser(user) });
  });
  app.get('/api/staff/me', staffOnly, (req, res) => res.set('Cache-Control', 'no-store').json({ user: req.staff }));
  app.post('/api/staff/logout', (req, res) => { revoke(req); setCookie(req, res, '', 0); res.json({ ok: true }); });
  app.post('/api/staff/password-reset-requests', resetRequestLimit, (req, res) => {
    const { username, role } = req.body || {};
    if (typeof username !== 'string' || !username.trim() || username.length > 100 || !['cashier', 'kitchen'].includes(role)) {
      return res.status(400).json({ error: 'Enter the username for a cashier or kitchen account' });
    }
    const user = database.prepare('SELECT id FROM staff_users WHERE username=? AND role=?').get(username.trim(), role);
    if (user) {
      database.prepare(`INSERT INTO staff_password_reset_requests(id,user_id,created_at)
        VALUES(?,?,?) ON CONFLICT(user_id) WHERE status='pending' DO NOTHING`)
        .run(randomUUID(), user.id, new Date().toISOString());
    }
    res.set('Cache-Control', 'no-store').status(202).json({
      message: 'If that account exists, the owner will review the request. Ask the owner in person for your temporary password.',
    });
  });
  app.get('/api/staff/accounts', roles('owner'), (_req, res) => {
    const accounts = database.prepare(`SELECT id,username,role,full_name,email,phone FROM staff_users
      WHERE role IN ('cashier','kitchen') ORDER BY role,username`).all().map(accountUser);
    const resetRequests = database.prepare(`SELECT r.id,r.created_at AS createdAt,u.username,u.role,u.full_name AS fullName
      FROM staff_password_reset_requests r JOIN staff_users u ON u.id=r.user_id
      WHERE r.status='pending' ORDER BY r.created_at`).all();
    res.set('Cache-Control', 'no-store').json({ accounts, resetRequests });
  });
  app.post('/api/staff/accounts', roles('owner'), (req, res) => {
    const { username, password, role, fullName, email = '', phone = '' } = req.body || {};
    if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,40}$/.test(username.trim())
      || !validPassword(password) || !['cashier', 'kitchen'].includes(role)
      || typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 100
      || typeof email !== 'string' || email.length > 200 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      || typeof phone !== 'string' || phone.length > 40) {
      return res.status(400).json({ error: 'Enter a 3–40 character username, a cashier or kitchen role, a name, a valid optional email/phone, and a password of at least 8 characters' });
    }
    try {
      const user = {
        id: randomUUID(), username: username.trim(), role, full_name: fullName.trim(),
        email: email.trim(), phone: phone.trim(),
      };
      database.prepare('INSERT INTO staff_users(id,username,password_hash,role,full_name,email,phone) VALUES(?,?,?,?,?,?,?)')
        .run(user.id, user.username, hashPassword(password), user.role, user.full_name, user.email, user.phone);
      res.status(201).json({ user: accountUser(user) });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That username is already in use' });
      throw error;
    }
  });
  app.post('/api/staff/password-reset-requests/:id/reset', roles('owner'), (req, res) => {
    const { password } = req.body || {};
    if (!validPassword(password)) return res.status(400).json({ error: passwordLengthError });
    const request = database.prepare(`SELECT id,user_id FROM staff_password_reset_requests
      WHERE id=? AND status='pending'`).get(req.params.id);
    if (!request) return res.status(404).json({ error: 'This password reset request is no longer pending' });
    const timestamp = new Date().toISOString();
    database.transaction(() => {
      database.prepare('UPDATE staff_users SET password_hash=? WHERE id=?').run(hashPassword(password), request.user_id);
      database.prepare('DELETE FROM staff_sessions WHERE user_id=?').run(request.user_id);
      database.prepare(`UPDATE staff_password_reset_requests SET status='resolved',resolved_at=?,resolved_by=?
        WHERE user_id=? AND status='pending'`).run(timestamp, req.staff.id, request.user_id);
    })();
    res.json({ ok: true });
  });
  app.patch('/api/staff/profile', staffOnly, (req, res) => {
    const { fullName, email, phone } = req.body || {};
    if (typeof fullName !== 'string' || !fullName.trim() || fullName.length > 100 || typeof email !== 'string' || email.length > 200 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || typeof phone !== 'string' || phone.length > 40) return res.status(400).json({ error: 'Enter a name, a valid email (or leave blank), and a phone number' });
    database.prepare('UPDATE staff_users SET full_name=?,email=?,phone=? WHERE id=?').run(fullName.trim(), email.trim(), phone.trim(), req.staff.id);
    res.json({ user: publicUser(database.prepare('SELECT * FROM staff_users WHERE id=?').get(req.staff.id)) });
  });
  app.post('/api/staff/password', staffOnly, (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || currentPassword.length > 256 || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 256) return res.status(400).json({ error: 'Use a new password between 8 and 256 characters' });
    const user = database.prepare('SELECT * FROM staff_users WHERE id=?').get(req.staff.id);
    if (!verify(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Current password is incorrect' });
    database.transaction(() => {
      database.prepare('UPDATE staff_users SET password_hash=? WHERE id=?').run(hashPassword(newPassword), user.id);
      database.prepare('DELETE FROM staff_sessions WHERE user_id=? AND token_hash<>?').run(user.id, digest(token(req)));
    })();
    res.json({ ok: true });
  });
}
