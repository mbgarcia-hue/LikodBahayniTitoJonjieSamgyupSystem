import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import QRCode from 'qrcode';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('table expansion, unique QR links, safe hiding and restoration', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'restaurant-tables-'));
  process.env.DATABASE_PATH = join(directory, 'tables.sqlite');
  for (const role of ['cashier', 'owner', 'kitchen']) process.env[`${role.toUpperCase()}_PASSWORD`] = 'TablesTest@123';
  const { installDining } = await import('./dining.js');
  const { default: db } = await import('./database.js');
  const app = express(); app.use(express.json()); installDining(app);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, body, cookie = '', token = '', method = 'POST') {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Visit-Token': token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  let cashier, owner, kitchen, visit, phone, batch;
  const state = async () => (await call('/dining/state', undefined, cashier)).data;
  const visibility = (id, hidden, cookie = cashier) => call(`/dining/tables/${id}`, { hidden }, cookie, '', 'PATCH');
  const open = (tableNumber, cookie = cashier) => call('/dining/open', { tableNumber, regularPax: 1, discountedPax: 0 }, cookie);
  try {
    for (const role of ['cashier', 'owner', 'kitchen']) {
      const cookie = (await call('/staff/login', { username: role, password: 'TablesTest@123', role })).cookie;
      if (role === 'cashier') cashier = cookie; else if (role === 'owner') owner = cookie; else kitchen = cookie;
    }
    await t.test('public lookup reveals only visible table identity; management requires cashier or owner', async () => {
      assert.deepEqual((await call('/dining/tables/1')).data, { id: 1 });
      for (const id of ['0', '-1', '11', 'unknown', '9007199254740992']) assert.equal((await call(`/dining/tables/${id}`)).status, 404);
      assert.equal((await call('/dining/tables', {})).status, 401);
      assert.equal((await call('/dining/tables', {}, kitchen)).status, 403);
      assert.equal((await visibility(1, true, '')).status, 401);
      assert.equal((await visibility(1, true, kitchen)).status, 403);
      const before = await state();
      assert.equal((await call('/dining/tables', { id: 1 }, cashier)).status, 400);
      assert.equal((await call('/dining/tables/1', { hidden: 'yes' }, cashier, '', 'PATCH')).status, 400);
      assert.equal((await call('/dining/tables/1', { hidden: true, status: 'available' }, cashier, '', 'PATCH')).status, 400);
      assert.equal((await visibility(999, true)).status, 404);
      assert.deepEqual(await state(), before);
    });
    await t.test('concurrent additions allocate distinct numbers above ten and unique QR images', async () => {
      const results = await Promise.all([cashier, owner, cashier].map(cookie => call('/dining/tables', {}, cookie)));
      assert.ok(results.every(r => r.status === 201));
      assert.deepEqual(results.map(r => r.data.id).sort((a, b) => a - b), [11, 12, 13]);
      const current = await state();
      assert.equal(current.tables.length, 13);
      assert.equal(new Set(current.tables.map(t => t.qrCode)).size, 13);
      const qr = await Promise.all(current.tables.map(t => QRCode.toDataURL(`https://restaurant.example/customer/${t.id}`)));
      assert.equal(new Set(qr).size, 13);
      assert.deepEqual((await call('/dining/tables/11')).data, { id: 11 });
    });
    await t.test('hidden tables reject new visits and QR access; additions do not reuse hidden numbers', async () => {
      assert.equal((await visibility(12, true)).status, 200);
      assert.equal((await call('/dining/tables/12')).status, 404);
      assert.equal((await open(12)).status, 409);
      assert.equal((await call('/dining/join', { tableNumber: 12, code: '123456' })).status, 401);
      const added = await call('/dining/tables', {}, owner);
      assert.equal(added.data.id, 14);
      const current = await state();
      assert.equal(current.tables.find(t => t.id === 12).qrCode, 'TABLE-12');
      assert.equal(current.tables.find(t => t.id === 12).hidden, true);
    });
    await t.test('an expanded table supports joining and ordering; every unfinished visit blocks hiding', async () => {
      visit = (await open(11)).data;
      phone = (await call('/dining/join', { tableNumber: 11, code: visit.code })).data;
      assert.ok(phone.token);
      assert.equal((await visibility(11, true)).status, 409);
      const submitted = await call(`/dining/visits/${visit.id}/orders`, { requestId: 'expanded-table-batch', items: [{ menuItemId: 'add-1', quantity: 1 }] }, '', phone.token);
      assert.equal(submitted.status, 200); batch = submitted.data;
      assert.equal(batch.tableNumber, 11);
      assert.equal((await visibility(11, true)).status, 409);
      assert.equal((await call(`/dining/orders/${batch.id}/approve`, { expectedTotal: 35 }, cashier)).status, 200);
      for (const status of ['preparing', 'ready', 'served']) {
        assert.equal((await call(`/dining/orders/${batch.id}`, { status }, kitchen, '', 'PATCH')).status, 200);
        assert.equal((await visibility(11, true)).status, 409);
      }
      assert.equal((await call(`/dining/visits/${visit.id}/request-bill`, {}, '', phone.token)).status, 200);
      assert.equal((await visibility(11, true)).status, 409);
      const paid = await call(`/dining/visits/${visit.id}/pay`, { paymentMethod: 'cash', amountReceived: 300, expectedTotal: 255 }, cashier);
      assert.equal(paid.status, 200); assert.equal(paid.data.tableNumber, 11);
    });
    await t.test('hiding a completed table preserves its payments, batches and customer receipt', async () => {
      const before = await state();
      assert.equal((await visibility(11, true)).status, 200);
      assert.equal((await call('/dining/tables/11')).status, 404);
      assert.equal((await call('/dining/join', { tableNumber: 11, code: visit.code })).status, 401);
      const current = await state();
      assert.deepEqual(current.orders, before.orders); assert.deepEqual(current.sessions, before.sessions); assert.deepEqual(current.transactions, before.transactions);
      const receipt = await call(`/dining/visits/${visit.id}`, undefined, '', phone.token);
      assert.equal(receipt.status, 200); assert.equal(receipt.data.session.status, 'closed'); assert.equal(receipt.data.total, 255);
    });
    await t.test('table additions and visibility survive restart; restoration keeps QR identity and fresh visit isolation', async () => {
      const before = db.prepare('SELECT body FROM dining_state WHERE id=1').get().body;
      const after = execFileSync(process.execPath, ['--input-type=module', '-e', `
        await import('./server/dining.js');
        const { default: db } = await import('./server/database.js');
        process.stdout.write(db.prepare('SELECT body FROM dining_state WHERE id=1').get().body);
        db.close();
      `], { encoding: 'utf8', env: { ...process.env } });
      assert.deepEqual(JSON.parse(after), JSON.parse(before));
      const restored = await visibility(11, false, owner);
      assert.equal(restored.data.id, 11); assert.equal(restored.data.qrCode, 'TABLE-11');
      assert.deepEqual((await call('/dining/tables/11')).data, { id: 11 });
      const next = (await open(11)).data;
      assert.notEqual(next.id, visit.id); assert.notEqual(next.code, visit.code);
      assert.equal((await call(`/dining/visits/${next.id}`, undefined, '', phone.token)).status, 401);
      assert.equal((await call('/dining/join', { tableNumber: 11, code: next.code })).status, 200);
    });
    await t.test('racing hide and open operations cannot create an active hidden table', async () => {
      const results = await Promise.all([visibility(14, true), open(14)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const current = await state(); const table = current.tables.find(t => t.id === 14);
      const active = current.sessions.some(s => s.tableNumber === 14 && s.status !== 'closed');
      assert.ok(!(table.hidden && active));
    });
  } finally {
    await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true });
  }
});
