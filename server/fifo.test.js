import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('FIFO migrates current stock to an opening lot, consumes oldest lots, and restores cancelled reservations', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'restaurant-fifo-'));
  process.env.DATABASE_PATH = join(directory, 'fifo.sqlite');
  process.env.MENU_IMAGE_DIR = join(directory, 'menu-images');
  process.env.CASHIER_PASSWORD = 'FifoTest@123';
  process.env.OWNER_PASSWORD = 'FifoTest@123';
  process.env.KITCHEN_PASSWORD = 'FifoTest@123';

  const { default: db } = await import('./database.js');
  db.exec('CREATE TABLE IF NOT EXISTS dining_state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)');
  const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
  const inventory = structuredClone(seed.inventory);
  inventory.find(item => item.id === 'inv-13').currentStock = 1.5;
  const legacyState = {
    workflowVersion: 2,
    tables: Array.from({ length: 10 }, (_, index) => ({ id: index + 1, qrCode: `TABLE-${index + 1}`, status: index === 1 ? 'occupied' : 'available' })),
    sessions: [{ id: 'legacy-fifo-visit', tableNumber: 2, customerName: 'Legacy FIFO Guest', customerNameSetBy: 'cashier', regularPax: 2, discountedPax: 0, packageTotal: 440, code: '123456', tokens: [], status: 'open' }],
    orders: [{ id: 'legacy-fifo-order', sessionId: 'legacy-fifo-visit', tableNumber: 2, batchNumber: 1, items: [{ menuItemId: 'add-1', name: 'Coke', quantity: 1, price: 35 }], status: 'submitted', timeOrdered: new Date().toISOString(), totalAmount: 35, reservedStock: { 'inv-13': 1 }, history: [] }],
    transactions: [], inventory, inventoryMovements: [], menu: seed.menu,
  };
  db.prepare('INSERT INTO dining_state VALUES(1, ?)').run(JSON.stringify(legacyState));

  const { installDining } = await import('./dining.js');
  const app = express(); app.use(express.json()); installDining(app);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, body, cookie = '', token = '', method = 'POST') {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Visit-Token': token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    const owner = (await call('/staff/login', { username: 'owner', password: 'FifoTest@123', role: 'owner' })).cookie;
    const openingState = (await call('/dining/state', undefined, owner)).data;
    const openingLot = openingState.inventory.find(item => item.id === 'inv-13').stockLots[0];
    assert.equal(openingLot.quantity, 2.5);
    assert.equal(openingLot.remainingQuantity, 1.5);
    assert.equal(openingLot.source, 'opening');

    const cashier = (await call('/staff/login', { username: 'cashier', password: 'FifoTest@123', role: 'cashier' })).cookie;
    assert.deepEqual((await call('/dining/state', undefined, cashier)).data.orders.find(order => order.id === 'legacy-fifo-order').reservedStockLots['inv-13'], [{ lotId: openingLot.id, quantity: 1, receivedAt: openingLot.receivedAt }]);
    assert.equal((await call('/dining/orders/legacy-fifo-order/cancel', { reason: 'Legacy order cancelled' }, cashier)).status, 200);
    assert.equal((await call('/dining/state', undefined, owner)).data.inventory.find(item => item.id === 'inv-13').currentStock, 2.5);
    const restock = await call('/dining/inventory/inv-13/restock', { quantity: 2, reason: 'New supplier delivery' }, owner);
    assert.equal(restock.status, 200);
    const visit = (await call('/dining/open', { tableNumber: 1, customerName: 'FIFO Guest', regularPax: 3, discountedPax: 0 }, cashier)).data;
    const customer = (await call('/dining/join', { tableNumber: 1, code: visit.code, customerName: 'FIFO Guest' })).data;

    const submit = requestId => call(`/dining/visits/${visit.id}/orders`, {
      requestId,
      items: [{ menuItemId: 'add-1', quantity: 3 }],
    }, '', customer.token);
    const first = await submit('fifo-cancelled-order');
    assert.equal(first.status, 200);
    assert.deepEqual(first.data.reservedStockLots['inv-13'].map(lot => lot.quantity), [2.5, 0.5]);
    let state = (await call('/dining/state', undefined, owner)).data;
    let lots = state.inventory.find(item => item.id === 'inv-13').stockLots;
    assert.deepEqual(lots.map(lot => lot.remainingQuantity), [0, 1.5]);

    assert.equal((await call(`/dining/orders/${first.data.id}/cancel`, { reason: 'Customer changed order' }, cashier)).status, 200);
    state = (await call('/dining/state', undefined, owner)).data;
    lots = state.inventory.find(item => item.id === 'inv-13').stockLots;
    assert.deepEqual(lots.map(lot => lot.remainingQuantity), [2.5, 2]);

    const second = await submit('fifo-followup-order');
    assert.equal(second.status, 200);
    assert.deepEqual(second.data.reservedStockLots['inv-13'].map(lot => lot.quantity), [2.5, 0.5]);
    state = (await call('/dining/state', undefined, owner)).data;
    lots = state.inventory.find(item => item.id === 'inv-13').stockLots;
    assert.equal(state.inventory.find(item => item.id === 'inv-13').currentStock, 1.5);
    assert.deepEqual(lots.map(lot => lot.remainingQuantity), [0, 1.5]);

    assert.equal((await call('/dining/inventory/inv-13', { currentStock: 2.5 }, owner, '', 'PATCH')).status, 200);
    state = (await call('/dining/state', undefined, owner)).data;
    lots = state.inventory.find(item => item.id === 'inv-13').stockLots;
    assert.deepEqual(lots.map(lot => lot.remainingQuantity), [0, 1.5, 1]);
    assert.equal((await call('/dining/inventory/inv-13', { currentStock: 1.5 }, owner, '', 'PATCH')).status, 200);
    state = (await call('/dining/state', undefined, owner)).data;
    lots = state.inventory.find(item => item.id === 'inv-13').stockLots;
    assert.equal(state.inventory.find(item => item.id === 'inv-13').currentStock, 1.5);
    assert.deepEqual(lots.map(lot => lot.remainingQuantity), [0, 0.5, 1]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
