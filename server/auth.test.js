import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

test('staff accounts and permissions', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'restaurant-auth-')); process.env.DATABASE_PATH = join(dir, 'auth.sqlite');
  const { installDining } = await import('./dining.js'); const { default: db } = await import('./database.js');
  const app = express(); app.use(express.json()); installDining(app); app.use((e, _req, res, _next) => res.status(e.status || 500).json({ error: e.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  async function call(path, body, cookie = '', method = 'POST') {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method: body === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = role => call('/staff/login', { username: role, password: `${role[0].toUpperCase()}${role.slice(1)}@123`, role });
  let cashier, kitchen, owner;
  try {
    await t.test('creates exactly three role accounts with salted hashes', () => {
      const users = db.prepare('SELECT * FROM staff_users').all(); assert.equal(users.length, 3);
      for (const u of users) { assert.match(u.password_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/); assert.ok(!u.password_hash.includes('@123')); }
      assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    });
    await t.test('each role signs in with its own username/password', async () => {
      cashier = await login('cashier'); kitchen = await login('kitchen'); owner = await login('owner');
      for (const [r, result] of Object.entries({ cashier, kitchen, owner })) { assert.equal(result.status, 200); assert.equal(result.body.user.role, r); assert.equal(result.body.user.password_hash, undefined); assert.equal((await call('/staff/me', undefined, result.cookie)).body.user.role, r); }
      const sessions = db.prepare('SELECT * FROM staff_sessions').all(); assert.equal(sessions.length, 3); assert.ok(sessions.every(s => ![cashier.cookie,kitchen.cookie,owner.cookie].some(c => c.endsWith(s.token_hash))));
    });
    await t.test('rejects wrong passwords, role spoofing, malformed and old PIN logins', async () => {
      assert.equal((await call('/staff/login', { username: 'owner', password: 'wrong', role: 'owner' })).status, 401);
      assert.equal((await call('/staff/login', { username: 'cashier', password: 'Cashier@123', role: 'owner' })).status, 401);
      assert.equal((await call('/staff/login', { username: "' OR 1=1 --", password: 'Owner@123', role: 'owner' })).status, 401);
      assert.equal((await call('/staff/login', { password: '1234' })).status, 400);
      assert.equal((await call('/staff/login', null)).status, 400);
      assert.equal((await call('/staff/me')).status, 401);
    });
    await t.test('sessions and changed bootstrap configuration survive a new server process', () => {
      const before = db.prepare('SELECT password_hash FROM staff_users WHERE username=?').get('owner').password_hash;
      const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
        import { readFileSync } from 'node:fs';
        import { staffOnly } from './server/auth.js';
        import db from './server/database.js';
        const { cookie } = JSON.parse(readFileSync(0, 'utf8'));
        const req = { headers: { cookie } };
        const res = { status() { throw new Error('Session did not persist'); } };
        staffOnly(req, res, () => process.stdout.write(req.staff.role));
        db.close();
      `], { input: JSON.stringify({ cookie: owner.cookie }), encoding: 'utf8', env: { ...process.env, OWNER_PASSWORD: 'DifferentBootstrap@123' } });
      assert.equal(output, 'owner');
      assert.equal(db.prepare('SELECT password_hash FROM staff_users WHERE username=?').get('owner').password_hash, before);
    });
    let visit;
    await t.test('cashier manages tables; kitchen cannot open visits, bill or edit stock', async () => {
      const body = { tableNumber: 1, regularPax: 1, discountedPax: 0 };
      assert.equal((await call('/dining/open', body, kitchen.cookie)).status, 403);
      visit = (await call('/dining/open', body, cashier.cookie)).body;
      for (const path of [`/dining/visits/${visit.id}/pay`, `/dining/visits/${visit.id}/reopen`, `/dining/staff/visits/${visit.id}/request-bill`]) assert.equal((await call(path, {}, kitchen.cookie)).status, 403);
      assert.equal((await call('/dining/inventory/inv-13', { currentStock: 40 }, kitchen.cookie, 'PATCH')).status, 403);
      assert.equal((await call('/dining/inventory/inv-13', { currentStock: 40 }, cashier.cookie, 'PATCH')).status, 200);
    });
    await t.test('state redacts customer credentials and kitchen financial records', async () => {
      const state = (await call('/dining/state', undefined, cashier.cookie)).body; assert.equal(state.sessions[0].tokens, undefined); assert.equal(state.sessions[0].code, visit.code);
      const ks = (await call('/dining/state', undefined, kitchen.cookie)).body; assert.deepEqual(ks.sessions, []); assert.deepEqual(ks.transactions, []); assert.deepEqual(ks.inventory, []);
      assert.equal((await call('/dining/orders/missing', { status: 'preparing' }, cashier.cookie, 'PATCH')).status, 403);
    });
    await t.test('profile changes save only to the current account', async () => {
      const result = await call('/staff/profile', { fullName: 'Cashier Updated', email: 'cashier@example.com', phone: '09123456789', role: 'owner' }, cashier.cookie, 'PATCH'); assert.equal(result.status, 200); assert.equal(result.body.user.role, 'cashier');
      assert.equal((await call('/staff/me', undefined, cashier.cookie)).body.user.fullName, 'Cashier Updated');
      assert.equal((await call('/staff/me', undefined, owner.cookie)).body.user.fullName, 'Owner User');
      assert.equal((await call('/staff/profile', { fullName: '', email: 'bad', phone: '' }, cashier.cookie, 'PATCH')).status, 400);
    });
    await t.test('password changes require the current password and revoke other sessions', async () => {
      const another = await login('cashier');
      assert.equal((await call('/staff/password', { currentPassword: 'wrong', newPassword: 'NewCashier@123' }, cashier.cookie)).status, 401);
      assert.equal((await call('/staff/password', { currentPassword: 'Cashier@123', newPassword: 'short' }, cashier.cookie)).status, 400);
      assert.equal((await call('/staff/password', { currentPassword: 'Cashier@123', newPassword: 'NewCashier@123' }, cashier.cookie)).status, 200);
      assert.equal((await call('/staff/me', undefined, another.cookie)).status, 401); assert.equal((await call('/staff/me', undefined, cashier.cookie)).status, 200);
      assert.equal((await login('cashier')).status, 401);
      assert.equal((await call('/staff/login', { username: 'cashier', password: 'NewCashier@123', role: 'cashier' })).status, 200);
    });
    await t.test('logout revokes server session and expired sessions are rejected', async () => {
      assert.equal((await call('/staff/logout', {}, owner.cookie)).status, 200); assert.equal((await call('/staff/me', undefined, owner.cookie)).status, 401);
      db.prepare('UPDATE staff_sessions SET expires_at=0 WHERE user_id=(SELECT id FROM staff_users WHERE username=?)').run('kitchen'); assert.equal((await call('/staff/me', undefined, kitchen.cookie)).status, 401);
    });
  } finally { await new Promise(r => server.close(r)); db.close(); rmSync(dir, { recursive: true, force: true }); }
});
