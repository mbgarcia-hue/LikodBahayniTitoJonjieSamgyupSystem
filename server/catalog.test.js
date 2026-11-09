import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('owner-managed products, stock links and customer menu visibility', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'restaurant-catalog-'));
  process.env.DATABASE_PATH = join(directory, 'catalog.sqlite');
  process.env.MENU_IMAGE_DIR = join(directory, 'menu-images');
  for (const role of ['cashier', 'owner', 'kitchen']) process.env[`${role.toUpperCase()}_PASSWORD`] = 'CatalogTest@123';
  const { installDining } = await import('./dining.js');
  const { default: db } = await import('./database.js');
  const app = express(); app.use(express.json({ limit: '5mb' })); installDining(app);
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
  const state = async () => (await call('/dining/state', undefined, owner)).data;
  const patch = (id, body, cookie = owner) => call(`/dining/inventory/${id}`, body, cookie, '', 'PATCH');
  const menuFor = async phone => (await call(`/dining/visits/${phone.id}`, undefined, '', phone.token)).data;
  const submit = (items, requestId) => call(`/dining/visits/${phones[0].id}/orders`, { items, requestId }, '', phones[0].token);
  try {
    cashier = (await call('/staff/login', { username: 'cashier', password: 'CatalogTest@123', role: 'cashier' })).cookie;
    owner = (await call('/staff/login', { username: 'owner', password: 'CatalogTest@123', role: 'owner' })).cookie;
    kitchen = (await call('/staff/login', { username: 'kitchen', password: 'CatalogTest@123', role: 'kitchen' })).cookie;
    await t.test('only owners manage inventory while cashiers can view it', async () => {
      assert.equal((await call('/dining/inventory', payload)).status, 401);
      assert.equal((await call('/dining/inventory', payload, kitchen)).status, 403);
      assert.equal((await patch('inv-13', { hiddenFromMenu: true }, kitchen)).status, 403);
      assert.equal((await patch('inv-13', { hiddenFromMenu: true }, cashier)).status, 403);
      assert.equal((await patch('inv-13', { hiddenFromMenu: false }, cashier)).status, 403);
      assert.equal((await patch('inv-13', { hiddenFromMenu: true }, '')).status, 401);
      const { default: sharp } = await import('sharp');
      const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c76b32' } }).png().toBuffer();
      const imageData = `data:image/png;base64,${photo.toString('base64')}`;
      const created = await call('/dining/inventory', { ...payload, name: 'Owner hidden product', hiddenFromMenu: true, currentStock: 0, imageData }, owner);
      assert.equal(created.status, 201);
      assert.equal(created.data.inventory.hiddenFromMenu, true);
      assert.match(created.data.menu.image, /^\/uploads\/menu\/[0-9a-f-]+\.webp$/);
      const cashierProduct = await call('/dining/inventory', { ...payload, name: 'Cashier added product', currentStock: 0, imageData }, cashier);
      assert.equal(cashierProduct.status, 403);
      assert.equal((await patch('inv-7', { archived: true }, cashier)).status, 403);
      const existing = await patch('inv-7', { imageData }, owner);
      assert.equal(existing.status, 400);
      const uploaded = await call('/dining/inventory/inv-7/image', { imageData }, owner, '', 'PUT');
      assert.equal(uploaded.status, 200);
      assert.match(uploaded.data.image, /^\/uploads\/menu\/[0-9a-f-]+\.webp$/);
      const stateAfterUpload = await state();
      assert.equal(stateAfterUpload.inventory.find(i => i.id === 'inv-7').image, uploaded.data.image);
      assert.equal((await patch('inv-7', { currentStock: 20 }, cashier)).status, 403);
      assert.equal((await call('/dining/inventory/inv-7/image', { imageData: 'data:image/png;base64,not-an-image' }, owner, '', 'PUT')).status, 400);
      assert.equal((await call('/dining/pricing', { regularGuestPrice: 250, discountedGuestPrice: 200 }, cashier, '', 'PATCH')).status, 403);
      assert.equal((await call('/dining/menu/add-1/pricing', { price: 40, priceMinimum: 30, priceMaximum: 50 }, cashier, '', 'PATCH')).status, 403);
    });
    await t.test('restocks require a positive quantity and reason and record stock and staff attribution', async () => {
      const itemId = 'inv-7';
      const before = (await state()).inventory.find(item => item.id === itemId).currentStock;
      assert.equal((await call(`/dining/inventory/${itemId}/restock`, { quantity: 2, reason: 'Delivery' })).status, 401);
      assert.equal((await call(`/dining/inventory/${itemId}/restock`, { quantity: 2, reason: 'Delivery' }, kitchen)).status, 403);
      assert.equal((await call(`/dining/inventory/${itemId}/restock`, { quantity: 2, reason: 'Delivery' }, cashier)).status, 403);
      assert.equal((await call(`/dining/inventory/${itemId}/restock`, { quantity: 0, reason: 'Delivery' }, owner)).status, 400);
      assert.equal((await call(`/dining/inventory/${itemId}/restock`, { quantity: 2, reason: ' ' }, owner)).status, 400);
      assert.equal((await call(`/dining/inventory/${itemId}/restock`, { quantity: 2, reason: 'Delivery', extra: true }, owner)).status, 400);
      const result = await call(`/dining/inventory/${itemId}/restock`, { quantity: 2.5, reason: 'Supplier delivery' }, owner);
      assert.equal(result.status, 200);
      assert.equal(result.data.beforeStock, before);
      assert.equal(result.data.afterStock, before + 2.5);
      assert.equal(result.data.actorName, 'owner');
      assert.equal(result.data.reason, 'Supplier delivery');
      const saved = await state();
      assert.equal(saved.inventory.find(item => item.id === itemId).currentStock, before + 2.5);
      assert.ok(saved.inventoryMovements.some(movement => movement.id === result.data.id && movement.actorName === 'owner'));
      assert.ok((await call('/dining/state', undefined, owner)).data.inventoryMovements.some(movement => movement.id === result.data.id));
    });
    await t.test('invalid and duplicate products leave database state unchanged', async () => {
      const before = await state();
      const invalid = [{ name: '' }, { name: 'x'.repeat(101) }, { category: '' }, { unit: '' }, { price: -1 }, { price: 1.001 }, { price: '35' }, { currentStock: -1 }, { currentStock: null }, { currentStock: 0.00001 }, { stockPerOrder: 0 }, { stockPerOrder: -1 }, { stockPerOrder: 0.00001 }, { lowStockThreshold: -1 }, { hiddenFromMenu: 'yes' }, { description: 'x'.repeat(1001) }, { id: 'overwrite' }];
      for (const fields of invalid) assert.equal((await call('/dining/inventory', { ...payload, ...fields }, owner)).status, 400, JSON.stringify(fields));
      assert.equal((await call('/dining/inventory', { ...payload, name: ' coke ' }, owner)).status, 409);
      assert.deepEqual(await state(), before);
    });
    await t.test('atomic creation saves one product, menu entry and attributed opening stock', async () => {
      const results = await Promise.all([1, 2].map(() => call('/dining/inventory', payload, owner)));
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      product = results.find(r => r.status === 201).data;
      assert.equal(product.menu.inventoryId, product.inventory.id);
      assert.equal(product.menu.stockPerOrder, 0.25);
      const current = await state();
      assert.equal(current.inventory.filter(i => i.name === payload.name).length, 1);
      assert.equal(current.menu.filter(i => i.name === payload.name).length, 1);
      const movement = current.inventoryMovements.find(m => m.itemId === product.inventory.id);
      assert.equal(movement.quantity, 3.5); assert.equal(movement.actorName, 'owner');
      for (let tableNumber = 1; tableNumber <= 10; tableNumber++) {
        const visit = (await call('/dining/open', { tableNumber, customerName: 'Catalog Guest', regularPax: 2, discountedPax: 0 }, cashier)).data;
        const phone = (await call('/dining/join', { tableNumber, code: visit.code, customerName: 'Catalog Guest' })).data;
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
      assert.equal(view.orders[0].items[0].name, payload.name); assert.equal(view.total, 539);
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
      assert.equal((await call('/dining/inventory', { ...payload, name: ' calAMAnsi   Juice ' }, owner)).status, 409);
      const fractional = await call('/dining/inventory', { ...payload, name: 'Cent price product', price: 0.1, stockPerOrder: 1 }, owner);
      const centsOrder = await submit([{ menuItemId: fractional.data.menu.id, quantity: 2 }], 'cents-price');
      assert.equal(centsOrder.status, 200); assert.equal(centsOrder.data.totalAmount, 0.2);
    });
    await t.test('only owners change package rates and menu item prices stay inside saved bounds', async () => {
      assert.equal((await call('/dining/pricing', { regularGuestPrice: 250, discountedGuestPrice: 200 }, owner, '', 'PATCH')).status, 200);
      assert.equal((await call('/dining/pricing', { regularGuestPrice: 250, discountedGuestPrice: 300 }, owner, '', 'PATCH')).status, 400);
      assert.equal((await call('/dining/menu/add-1/pricing', { price: 45, priceMinimum: 40, priceMaximum: 50 }, owner, '', 'PATCH')).status, 200);
      assert.equal((await call('/dining/menu/add-1/pricing', { price: 39, priceMinimum: 40, priceMaximum: 50 }, owner, '', 'PATCH')).status, 400);
      assert.equal((await call('/dining/menu/add-1/pricing', { price: 45, priceMinimum: 51, priceMaximum: 50 }, owner, '', 'PATCH')).status, 400);
      const table = (await call('/dining/tables', {}, owner)).data;
      const visit = (await call('/dining/open', { tableNumber: table.id, customerName: 'Pricing Guest', regularPax: 2, discountedPax: 0 }, cashier)).data;
      assert.equal(visit.packageTotal, 500);
      const phone = (await call('/dining/join', { tableNumber: table.id, code: visit.code, customerName: 'Pricing Guest' })).data;
      const order = await call(`/dining/visits/${visit.id}/orders`, { requestId: 'owner-menu-price', items: [{ menuItemId: 'add-1', quantity: 1 }] }, '', phone.token);
      assert.equal(order.data.totalAmount, 45);
      const stateAfter = await state();
      assert.equal(stateAfter.sessions.find(session => session.id === visit.id).packageTotal, 500);
      assert.equal(stateAfter.menu.find(item => item.id === 'add-1').price, 45);
    });
  } finally {
    await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true, force: true });
  }
});
