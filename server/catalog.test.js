import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('cashier product creation, stock links and customer menu visibility', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'restaurant-catalog-'));
  process.env.DATABASE_PATH = join(directory, 'catalog.sqlite');
  for (const role of ['cashier', 'owner', 'kitchen']) process.env[`${role.toUpperCase()}_PASSWORD`] = 'CatalogTest@123';
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
  const payload = { name: 'Calamansi Juice', category: 'Drinks', price: 49.5, description: 'Fresh juice', unit: 'liters', currentStock: 3.5, lowStockThreshold: 1, stockPerOrder: 0.25, hiddenFromMenu: false };
  let cashier, kitchen, owner, product, batch;
  const phones = [];
  const state = async () => (await call('/dining/state', undefined, cashier)).data;
  const patch = (id, body, cookie = cashier) => call(`/dining/inventory/${id}`, body, cookie, '', 'PATCH');
  const menuFor = async phone => (await call(`/dining/visits/${phone.id}`, undefined, '', phone.token)).data;
  const submit = (items, requestId) => call(`/dining/visits/${phones[0].id}/orders`, { items, requestId }, '', phones[0].token);
  try {
    cashier = (await call('/staff/login', { username: 'cashier', password: 'CatalogTest@123', role: 'cashier' })).cookie;
    owner = (await call('/staff/login', { username: 'owner', password: 'CatalogTest@123', role: 'owner' })).cookie;
    kitchen = (await call('/staff/login', { username: 'kitchen', password: 'CatalogTest@123', role: 'kitchen' })).cookie;
    await t.test('creation and hiding require cashier or owner access', async () => {
      assert.equal((await call('/dining/inventory', payload)).status, 401);
      assert.equal((await call('/dining/inventory', payload, kitchen)).status, 403);
      assert.equal((await patch('inv-13', { hiddenFromMenu: true }, kitchen)).status, 403);
      assert.equal((await patch('inv-13', { hiddenFromMenu: true }, '')).status, 401);
      const created = await call('/dining/inventory', { ...payload, name: 'Owner hidden product', hiddenFromMenu: true, currentStock: 0 }, owner);
      assert.equal(created.status, 201);
      assert.equal(created.data.inventory.hiddenFromMenu, true);
    });
    await t.test('invalid and duplicate products leave database state unchanged', async () => {
      const before = await state();
      const invalid = [{ name: '' }, { name: 'x'.repeat(101) }, { category: '' }, { unit: '' }, { price: -1 }, { price: 1.001 }, { price: '35' }, { currentStock: -1 }, { currentStock: null }, { currentStock: 0.00001 }, { stockPerOrder: 0 }, { stockPerOrder: -1 }, { stockPerOrder: 0.00001 }, { lowStockThreshold: -1 }, { hiddenFromMenu: 'yes' }, { description: 'x'.repeat(1001) }, { id: 'overwrite' }];
      for (const fields of invalid) assert.equal((await call('/dining/inventory', { ...payload, ...fields }, cashier)).status, 400, JSON.stringify(fields));
      assert.equal((await call('/dining/inventory', { ...payload, name: ' coke ' }, cashier)).status, 409);
      assert.deepEqual(await state(), before);
    });
    await t.test('atomic creation saves one product, menu entry and attributed opening stock', async () => {
      const results = await Promise.all([1, 2].map(() => call('/dining/inventory', payload, cashier)));
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      product = results.find(r => r.status === 201).data;
      assert.equal(product.menu.inventoryId, product.inventory.id);
      assert.equal(product.menu.stockPerOrder, 0.25);
      const current = await state();
      assert.equal(current.inventory.filter(i => i.name === payload.name).length, 1);
      assert.equal(current.menu.filter(i => i.name === payload.name).length, 1);
      const movement = current.inventoryMovements.find(m => m.itemId === product.inventory.id);
      assert.equal(movement.quantity, 3.5); assert.equal(movement.actorName, 'cashier');
      for (let tableNumber = 1; tableNumber <= 10; tableNumber++) {
        const visit = (await call('/dining/open', { tableNumber, regularPax: 1, discountedPax: 0 }, cashier)).data;
        const phone = (await call('/dining/join', { tableNumber, code: visit.code })).data;
        phones.push(phone);
        assert.ok((await menuFor(phone)).menu.some(m => m.id === product.menu.id));
        assert.ok(!(await menuFor(phone)).menu.some(m => m.name === 'Owner hidden product'));
      }
      const created = await submit([{ menuItemId: product.menu.id, quantity: 2, price: 1 }], 'new-product-order');
      assert.equal(created.status, 200); batch = created.data;
      assert.equal(batch.totalAmount, 99);
      assert.equal(batch.reservedStock[product.inventory.id], 0.5);
      assert.equal((await state()).inventory.find(i => i.id === product.inventory.id).currentStock, 3);
    });
    await t.test('hiding affects all ten customer menus and rejects stale carts without changing orders or stock', async () => {
      const before = await state();
      assert.equal((await patch(product.inventory.id, { hiddenFromMenu: 'true' })).status, 400);
      assert.equal((await patch(product.inventory.id, { hiddenFromMenu: true, overwrite: true })).status, 400);
      assert.equal((await patch(product.inventory.id, { hiddenFromMenu: true })).status, 200);
      assert.equal((await patch('inv-13', { hiddenFromMenu: true })).status, 200);
      // The original Pork inventory record and Pork Belly menu entry have different names.
      assert.equal((await patch('inv-0', { hiddenFromMenu: true })).status, 200);
      for (const phone of phones) {
        const menu = (await menuFor(phone)).menu;
        assert.ok(!menu.some(m => m.id === product.menu.id));
        assert.ok(!menu.some(m => m.id === 'add-1'));
        assert.ok(!menu.some(m => m.id === 'meat-0'));
      }
      assert.equal((await submit([{ menuItemId: product.menu.id, quantity: 1 }], 'hidden-new')).status, 400);
      assert.equal((await submit([{ menuItemId: 'add-1', quantity: 1 }], 'hidden-existing')).status, 400);
      const current = await state();
      assert.deepEqual(current.orders, before.orders);
      assert.equal(current.inventory.find(i => i.id === product.inventory.id).currentStock, 3);
      const view = await menuFor(phones[0]);
      assert.equal(view.orders[0].items[0].name, payload.name); assert.equal(view.total, 319);
      assert.equal((await call(`/dining/orders/${batch.id}/approve`, { expectedTotal: 99 }, cashier)).status, 200);
    });
    await t.test('product links and hidden state survive another server process', () => {
      const before = db.prepare('SELECT body FROM dining_state WHERE id=1').get().body;
      const after = execFileSync(process.execPath, ['--input-type=module', '-e', `
        await import('./server/dining.js');
        const { default: db } = await import('./server/database.js');
        process.stdout.write(db.prepare('SELECT body FROM dining_state WHERE id=1').get().body);
        db.close();
      `], { encoding: 'utf8', env: { ...process.env } });
      assert.deepEqual(JSON.parse(after), JSON.parse(before));
    });
    await t.test('showing, out-of-stock checks, archiving and cancellation use saved product stock links', async () => {
      await patch(product.inventory.id, { hiddenFromMenu: false }, owner);
      await patch('inv-13', { hiddenFromMenu: false });
      await patch('inv-0', { hiddenFromMenu: false });
      assert.ok((await menuFor(phones[0])).menu.some(m => m.id === product.menu.id && m.available));
      // A separate unapproved visit can still cancel a queued product reservation.
      const order = (await call(`/dining/visits/${phones[1].id}/orders`, { requestId: 'second-new-product', items: [{ menuItemId: product.menu.id, quantity: 1 }] }, '', phones[1].token)).data;
      assert.equal((await state()).inventory.find(i => i.id === product.inventory.id).currentStock, 2.75);
      await patch(product.inventory.id, { archived: true });
      assert.ok(!(await menuFor(phones[0])).menu.some(m => m.id === product.menu.id));
      assert.equal((await submit([{ menuItemId: product.menu.id, quantity: 1 }], 'archived')).status, 400);
      assert.equal((await call(`/dining/orders/${order.id}/cancel`, { reason: 'Customer changed mind' }, cashier)).status, 200);
      assert.equal((await state()).inventory.find(i => i.id === product.inventory.id).currentStock, 3);
      await patch(product.inventory.id, { archived: false, currentStock: 0 });
      assert.equal((await menuFor(phones[0])).menu.find(m => m.id === product.menu.id).available, false);
      assert.equal((await submit([{ menuItemId: product.menu.id, quantity: 1 }], 'out-of-stock')).status, 409);
      assert.equal((await call('/dining/inventory', { ...payload, name: ' calAMansi   Juice ' }, cashier)).status, 409);
      const fractional = await call('/dining/inventory', { ...payload, name: 'Cent price product', price: 0.1, stockPerOrder: 1 }, cashier);
      const centsOrder = await submit([{ menuItemId: fractional.data.menu.id, quantity: 3 }], 'cents-price');
      assert.equal(centsOrder.status, 200); assert.equal(centsOrder.data.totalAmount, 0.3);
    });
  } finally {
    await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true });
  }
});
