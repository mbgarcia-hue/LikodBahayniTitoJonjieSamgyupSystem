import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrateState, billFor } from './dining-workflow.js';

test('legacy migration preserves batches, amounts, timestamps and real preparation history', () => {
  const state = { sessions: [{ id: 'visit', status: 'open' }], orders: ['pending','preparing','ready','served','completed'].map((status,i) => ({ id: `o${i}`, sessionId: 'visit', status, timeOrdered: '2026-01-01', totalAmount: 35, items: [{ name: 'Coke', quantity: 1 }] })), transactions: [{ id: 'old-payment' }], inventory: [{ currentStock: 10 }] };
  const original = structuredClone(state); assert.equal(migrateState(state), true);
  assert.deepEqual(state.orders.map(o => o.status), ['submitted','preparing','ready','served','completed']);
  assert.deepEqual(state.orders.map(o => o.batchNumber), [1,2,3,4,5]);
  for (let i=0; i<5; i++) { assert.deepEqual(state.orders[i].items, original.orders[i].items); assert.equal(state.orders[i].totalAmount, 35); assert.equal(state.orders[i].timeOrdered, '2026-01-01'); assert.equal(state.orders[i].approvedBy, undefined); }
  assert.deepEqual(state.inventory, original.inventory); assert.deepEqual(state.transactions, original.transactions);
  const after = structuredClone(state); assert.equal(migrateState(state), false); assert.deepEqual(state, after);
});

test('cashier-approved batches, stock reservations, strict service completion and audited closure', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'restaurant-workflow-')); process.env.DATABASE_PATH = join(dir, 'workflow.sqlite');
  const { installDining } = await import('./dining.js'); const { default: db } = await import('./database.js');
  const app = express(); app.use(express.json()); installDining(app); app.use((e,_req,res,_next) => res.status(e.status || 500).json({ error: e.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const root = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, body, cookie = '', token = '', method = 'POST') {
    const res = await fetch(root + path, { method: body === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Visit-Token': token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = async role => (await call('/staff/login', { username: role, password: role[0].toUpperCase()+role.slice(1)+'@123', role })).cookie;
  let cashier, kitchen, visit, phone, first, second, cancelled, savedFirst;
  const state = async () => (await call('/dining/state', undefined, cashier)).data;
  const patch = (o, status, cookie = kitchen) => call(`/dining/orders/${o.id}`, { status }, cookie, '', 'PATCH');
  const pay = (total, cash = 1000) => call(`/dining/visits/${visit.id}/pay`, { paymentMethod: 'cash', amountReceived: cash, expectedTotal: total }, cashier);
  try {
    cashier = await login('cashier'); kitchen = await login('kitchen');
    await t.test('multiple submissions remain separate, numbered and hidden from kitchen', async () => {
      visit = (await call('/dining/open', { tableNumber: 1, regularPax: 2, discountedPax: 1 }, cashier)).data;
      phone = (await call('/dining/join', { tableNumber: 1, code: visit.code })).data;
      const submit = items => call(`/dining/visits/${visit.id}/orders`, { requestId: `batch-${Math.random()}`, items, notes: 'Review with customer' }, '', phone.token);
      first = (await submit([{ menuItemId: 'add-1', quantity: 2, price: 1 }])).data;
      second = (await submit([{ menuItemId: 'meat-0', quantity: 1 }])).data;
      cancelled = (await submit([{ menuItemId: 'add-2', quantity: 1 }])).data;
      assert.deepEqual([first.status,second.status,cancelled.status], ['submitted','submitted','submitted']);
      assert.deepEqual([first.batchNumber,second.batchNumber,cancelled.batchNumber], [1,2,3]);
      assert.equal(first.totalAmount, 70); assert.equal((await call('/dining/state', undefined, kitchen)).data.orders.length, 0);
      savedFirst = structuredClone(first.items);
      assert.equal((await patch(first, 'preparing')).status, 409);
      assert.equal((await call(`/dining/orders/${first.id}/approve`, { expectedTotal: 70 }, kitchen)).status, 403);
      assert.equal((await call(`/dining/orders/${first.id}/approve`, { expectedTotal: 70 })).status, 401);
    });
    await t.test('cancelling queued batches before initial approval releases stock exactly once', async () => {
      const before = (await state()).inventory.find(i => i.id === 'inv-14').currentStock;
      assert.equal((await call(`/dining/orders/${cancelled.id}/cancel`, { reason: '' }, cashier)).status, 400);
      await call(`/dining/orders/${cancelled.id}/cancel`, { reason: 'Customer no longer wants Sprite' }, cashier);
      await call(`/dining/orders/${cancelled.id}/cancel`, { reason: 'Duplicate retry' }, cashier);
      const current = await state(); assert.equal(current.inventory.find(i => i.id === 'inv-14').currentStock, before+1);
      const s = current.sessions.find(s => s.id === visit.id); assert.equal(s.total, 705); assert.equal(s.packageTotal, 635);
      assert.equal((await call(`/dining/orders/${cancelled.id}/approve`, { expectedTotal: 35 }, cashier)).status, 409);
      assert.equal((await patch(cancelled, 'preparing')).status, 409);
    });
    await t.test('one initial approval validates totals and atomically releases queued follow-ups', async () => {
      assert.equal((await call(`/dining/orders/${second.id}/approve`, { expectedTotal: 0 }, cashier)).status, 409);
      assert.equal((await call(`/dining/orders/${first.id}/approve`, { expectedTotal: 1 }, cashier)).status, 409);
      const approvals = await Promise.all([1,2].map(() => call(`/dining/orders/${first.id}/approve`, { expectedTotal: 70 }, cashier)));
      assert.ok(approvals.every(r => r.status === 200)); assert.equal(approvals[0].data.approvedByName, 'cashier');
      const ks = (await call('/dining/state', undefined, kitchen)).data; assert.deepEqual(ks.orders.map(o => o.id), [first.id, second.id]);
      assert.equal(ks.orders[1].approvalType, 'automatic'); assert.equal(ks.orders[1].initialApprovalOrderId, first.id);
      assert.equal(ks.orders[1].approvedBy, undefined);
      assert.equal(ks.orders[0].items[0].price, 0); assert.ok(ks.orders[0].history.every(h => !h.items && h.totalAmount === undefined && h.verifiedTotal === undefined));
      assert.equal((await call(`/dining/orders/${first.id}`, { status: 'preparing', items: [] }, kitchen, '', 'PATCH')).status, 400);
      assert.equal((await call(`/dining/orders/${first.id}/cancel`, { reason: 'Customer changed mind' }, cashier)).status, 409);
      assert.deepEqual((await state()).orders.find(o => o.id === first.id).items, savedFirst);
      assert.equal(db.prepare("SELECT count(*) AS n FROM dining_events WHERE order_id=? AND event_type='batch_approved'").get(first.id).n, 1);
    });
    await t.test('pausing ordering preserves unfinished batches and prevents payment at every stage', async () => {
      await call(`/dining/visits/${visit.id}/request-bill`, {}, '', phone.token);
      assert.equal((await pay(705)).status, 409);
      assert.equal((await call(`/dining/visits/${visit.id}/orders`, { requestId: 'paused', items: [{ menuItemId: 'add-1', quantity: 1 }] }, '', phone.token)).status, 409);
      assert.equal((await state()).orders.find(o => o.id === second.id).approvalType, 'automatic');
      assert.equal((await patch(first,'served')).status, 409);
      assert.equal((await patch(first,'preparing',cashier)).status, 403);
      assert.equal((await patch(first,'preparing')).status, 200); assert.equal((await pay(705)).status, 409);
      assert.equal((await patch(first,'ready')).status, 200); assert.equal((await pay(705)).status, 409);
      assert.equal((await patch(first,'served',cashier)).status, 200); assert.equal((await pay(705)).status, 409);
      await patch(second,'preparing'); await patch(second,'ready');
      assert.equal((await patch(second, 'served', cashier)).status, 403);
      await patch(second,'served');
      assert.equal((await patch(second,'preparing')).status, 409);
      assert.equal((await state()).sessions.find(s => s.id === visit.id).canClose, true);
    });
    await t.test('discounts and payment validation protect the final bill', async () => {
      for (const amount of [-1, 9999, 0.001]) assert.equal((await call(`/dining/visits/${visit.id}/discount`, { amount, reason: 'Staff approved' }, cashier, '', 'PATCH')).status, 400);
      assert.equal((await call(`/dining/visits/${visit.id}/discount`, { amount: 10.12, reason: 'Loyalty adjustment' }, cashier, '', 'PATCH')).status, 200);
      const customerBill = (await call(`/dining/visits/${visit.id}`, undefined, '', phone.token)).data;
      assert.equal(customerBill.total, 694.88); assert.equal(customerBill.discountReason, 'Loyalty adjustment');
      assert.equal((await pay(705)).status, 409); assert.equal((await pay(694.88, 100)).status, 400);
      assert.equal((await call(`/dining/visits/${visit.id}/pay`, { paymentMethod: 'online', expectedTotal: 694.88 }, cashier)).status, 400);
      const payment = await pay(694.88); assert.equal(payment.status, 200); assert.equal(payment.data.totalBill, 694.88); assert.equal(payment.data.discountAmount, 10.12); assert.equal(payment.data.change, 305.12); assert.equal(payment.data.confirmedByName, 'cashier');
      assert.equal((await pay(694.88)).data.id, payment.data.id);
    });
    await t.test('closure preserves served states and append-only staff/customer audit history', async () => {
      const current = await state(); assert.deepEqual(current.orders.map(o => o.status), ['served','served','cancelled']);
      assert.equal(current.transactions.length, 1); assert.equal(current.tables[0].status, 'available');
      assert.deepEqual(current.orders[0].history.map(h => h.status), ['submitted','approved','preparing','ready','served']);
      assert.deepEqual(current.orders[0].items, savedFirst);
      const events = (await call(`/dining/visits/${visit.id}/audit`, undefined, cashier)).data;
      assert.ok(events.some(e => e.event_type === 'batch_approved' && e.actor_name === 'cashier'));
      assert.ok(events.some(e => e.event_type === 'batch_preparing' && e.actor_role === 'kitchen'));
      assert.ok(events.some(e => e.event_type === 'session_closed'));
      assert.throws(() => db.prepare('DELETE FROM dining_events WHERE id=?').run(events[0].id), /append-only/);
      assert.throws(() => db.prepare('UPDATE dining_events SET event_type=? WHERE id=?').run('changed', events[0].id), /append-only/);
      assert.equal((await call(`/dining/visits/${visit.id}/audit`, undefined, kitchen)).status, 403);
      assert.equal((await patch(first,'served')).status, 409); assert.equal((await call(`/dining/visits/${visit.id}/reopen`, {}, cashier)).status, 409);
      const next = (await call('/dining/open', { tableNumber: 1, regularPax: 1, discountedPax: 0 }, cashier)).data; assert.notEqual(next.id, visit.id);
      assert.equal((await call(`/dining/visits/${next.id}`, undefined, '', phone.token)).status, 401);
    });
    await t.test('concurrent submissions cannot oversell reserved stock', async () => {
      const next = (await call('/dining/open', { tableNumber: 2, regularPax: 1, discountedPax: 0 }, cashier)).data;
      const joiner = (await call('/dining/join', { tableNumber: 2, code: next.code })).data;
      await call('/dining/inventory/inv-13', { currentStock: 1 }, cashier, '', 'PATCH');
      const attempts = await Promise.all(['one','two'].map(requestId => call(`/dining/visits/${next.id}/orders`, { requestId, items: [{ menuItemId: 'add-1', quantity: 1 }] }, '', joiner.token)));
      assert.deepEqual(attempts.map(r => r.status).sort(), [200,409]);
      assert.equal((await state()).inventory.find(i => i.id === 'inv-13').currentStock, 0);
      const reservedBatch = attempts.find(r => r.status === 200).data;
      await call(`/dining/visits/${next.id}/discount`, { amount: 250, reason: 'Staff adjustment' }, cashier, '', 'PATCH');
      assert.equal((await call(`/dining/orders/${reservedBatch.id}/cancel`, { reason: 'Customer changed mind' }, cashier)).status, 409);
      assert.equal((await state()).inventory.find(i => i.id === 'inv-13').currentStock, 0);
      assert.equal(db.prepare("SELECT count(*) AS n FROM dining_events WHERE order_id=? AND event_type='batch_cancelled'").get(reservedBatch.id).n, 0);
      await call(`/dining/visits/${next.id}/discount`, { amount: 0, reason: '' }, cashier, '', 'PATCH');
      assert.equal((await call(`/dining/orders/${reservedBatch.id}/cancel`, { reason: 'Customer changed mind' }, cashier)).status, 200);
      assert.equal((await state()).inventory.find(i => i.id === 'inv-13').currentStock, 1);
      assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    });
  } finally { await new Promise(r => server.close(r)); db.close(); rmSync(dir, { recursive: true, force: true }); }
});
