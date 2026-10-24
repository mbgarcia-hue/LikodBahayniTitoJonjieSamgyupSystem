import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import QRCode from 'qrcode';
import { execFileSync } from 'node:child_process';

test('ten tables, shared visits, stock, retries, billing and fresh table reuse', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'restaurant-test-'));
  process.env.DATABASE_PATH = join(directory, 'test.sqlite');
  process.env.OWNER_PASSWORD = 'test-password';
  const { installDining } = await import('./dining.js');
  const { default: db } = await import('./database.js');
  const app = express(); app.use(express.json()); installDining(app);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`; let cookie = '';
  async function request(path, body, token, authenticated = true, method = 'POST') {
    const res = await fetch(base + path, { method: body === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}), ...(token ? { 'X-Visit-Token': token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json(); return { status: res.status, data, res };
  }
  try {
    assert.equal((await request('/dining/state')).status, 401);
    assert.equal((await request('/staff/login', { username: 'owner', password: 'wrong', role: 'owner' })).status, 401);
    const login = await request('/staff/login', { username: 'owner', password: 'test-password', role: 'owner' }); cookie = login.res.headers.get('set-cookie').split(';')[0];
    let state = (await request('/dining/state')).data;
    assert.deepEqual(state.tables.map(t => t.id), [1,2,3,4,5,6,7,8,9,10]);
    const qr = await Promise.all(state.tables.map(t => QRCode.toDataURL(`https://restaurant.example/customer/${t.id}`)));
    assert.equal(new Set(qr).size, 10); assert.ok(qr.every(s => s.startsWith('data:image/png;base64,')));
    assert.equal((await request('/dining/open', { tableNumber: 11, regularPax: 1, discountedPax: 0 })).status, 400);
    const s = (await request('/dining/open', { tableNumber: 1, regularPax: 2, discountedPax: 1 })).data;
    assert.equal(s.packageTotal, 635);
    assert.equal((await request('/dining/open', { tableNumber: 1, regularPax: 1, discountedPax: 0 })).status, 409);
    assert.equal((await request('/dining/join', { tableNumber: 1, code: 'wrong' })).status, 401);
    const a = (await request('/dining/join', { tableNumber: 1, code: s.code })).data;
    const b = (await request('/dining/join', { tableNumber: 1, code: s.code })).data;
    assert.notEqual(a.token, b.token);
    const other = (await request('/dining/open', { tableNumber: 2, regularPax: 1, discountedPax: 0 })).data;
    assert.equal((await request(`/dining/visits/${other.id}`, undefined, a.token)).status, 401);
    assert.equal((await request(`/dining/visits/${s.id}`)).status, 401);
    const payload = { requestId: 'retry-key', items: [{ menuItemId: 'add-1', quantity: 2, price: 1 }], notes: 'No ice' };
    const created = await request(`/dining/visits/${s.id}/orders`, payload, a.token); assert.equal(created.status, 200); assert.equal(created.data.totalAmount, 70);
    assert.equal((await request(`/dining/visits/${s.id}/orders`, { requestId: 'null-item', items: [null] }, a.token)).status, 400);
    assert.equal((await request(`/dining/orders/${created.data.id}`, {}, undefined, true, 'PATCH')).status, 409);
    const repeated = await request(`/dining/visits/${s.id}/orders`, payload, a.token); assert.equal(repeated.data.id, created.data.id);
    let view = (await request(`/dining/visits/${s.id}`, undefined, b.token)).data;
    assert.equal(view.orders.length, 1); assert.equal(view.total, 705); assert.equal(view.orders[0].customerNotes, 'No ice');
    assert.equal(view.session.code, undefined); assert.equal(view.session.tokens, undefined);
    state = (await request('/dining/state')).data; assert.equal(state.inventory.find(i => i.id === 'inv-13').currentStock, 46);
    const tooMuch = { requestId: 'stock-test', items: [{ menuItemId: 'add-1', quantity: 30 }, { menuItemId: 'add-1', quantity: 30 }] };
    assert.equal((await request(`/dining/visits/${s.id}/orders`, tooMuch, a.token)).status, 409);
    assert.equal((await request(`/dining/visits/${s.id}/orders`, { requestId: 'bad', items: [{ menuItemId: 'add-1', quantity: -1 }] }, a.token)).status, 400);
    await request(`/dining/orders/${created.data.id}/approve`, { expectedTotal: 70 });
    await request(`/dining/orders/${created.data.id}`, { status: 'preparing' }, undefined, true, 'PATCH');
    view = (await request(`/dining/visits/${s.id}`, undefined, b.token)).data; assert.equal(view.orders[0].status, 'preparing');
    await request(`/dining/visits/${s.id}/request-bill`, {}, b.token);
    assert.equal((await request(`/dining/visits/${s.id}/orders`, { ...payload, requestId: 'paused' }, a.token)).status, 409);
    assert.equal((await request(`/dining/visits/${s.id}/pay`, { paymentMethod: 'cash', amountReceived: 705 }, a.token, false)).status, 401);
    assert.equal((await request(`/dining/visits/${s.id}/pay`, { paymentMethod: 'cash', amountReceived: 1, expectedTotal: 705 })).status, 409);
    await request(`/dining/visits/${s.id}/reopen`, {});
    const second = (await request(`/dining/visits/${s.id}/orders`, { ...payload, requestId: 'second' }, b.token)).data;
    assert.equal(second.status, 'approved'); assert.equal(second.approvalType, 'automatic');
    assert.equal(second.initialApprovalOrderId, created.data.id); assert.equal(second.approvedBy, undefined);
    for (const batch of [created.data, second]) {
      if (batch.id === second.id) await request(`/dining/orders/${batch.id}`, { status: 'preparing' }, undefined, true, 'PATCH');
      await request(`/dining/orders/${batch.id}`, { status: 'ready' }, undefined, true, 'PATCH');
      await request(`/dining/orders/${batch.id}`, { status: 'served' }, undefined, true, 'PATCH');
    }
    await request(`/dining/staff/visits/${s.id}/request-bill`, {});
    const paid = await request(`/dining/visits/${s.id}/pay`, { paymentMethod: 'cash', amountReceived: 1000, expectedTotal: 775 }); assert.equal(paid.data.totalBill, 775);
    await request(`/dining/visits/${s.id}/pay`, { paymentMethod: 'cash', amountReceived: 1000, expectedTotal: 775 });
    state = (await request('/dining/state')).data; assert.equal(state.transactions.length, 1); assert.equal(state.tables[0].status, 'available'); assert.ok(state.orders.every(o => o.status === 'served'));
    const next = (await request('/dining/open', { tableNumber: 1, regularPax: 1, discountedPax: 0 })).data; assert.notEqual(next.id, s.id);
    assert.equal((await request(`/dining/visits/${next.id}`, undefined, a.token)).status, 401);
    const newJoin = (await request('/dining/join', { tableNumber: 1, code: next.code })).data;
    view = (await request(`/dining/visits/${next.id}`, undefined, newJoin.token)).data; assert.equal(view.total, 220); assert.equal(view.orders.length, 0); assert.equal(view.session.status, 'open');
    assert.equal((await request(`/dining/visits/${s.id}/orders`, { ...payload, requestId: 'old' }, a.token)).status, 409);
    assert.ok(db.prepare('SELECT body FROM dining_state').get().body.includes(next.id));
    // Reboot against the same file: saved stock, batches and payments must not be reseeded.
    assert.equal((await request('/dining/inventory/inv-7', { currentStock: 12.375 }, undefined, true, 'PATCH')).status, 200);
    assert.equal((await request('/dining/state')).data.inventory.find(i => i.id === 'inv-7').currentStock, 12.375);
    const persisted = db.prepare('SELECT body FROM dining_state WHERE id=1').get().body;
    const afterRestart = execFileSync(process.execPath, ['--input-type=module', '-e', `
      await import('./server/dining.js');
      const { default: database } = await import('./server/database.js');
      process.stdout.write(database.prepare('SELECT body FROM dining_state WHERE id=1').get().body);
      database.close();
    `], { encoding: 'utf8', env: { ...process.env } });
    assert.deepEqual(JSON.parse(afterRestart), JSON.parse(persisted));
    await request('/staff/logout', {});
    assert.equal((await request('/dining/state')).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true }); }
});
