import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { initialApprovalFor } from './dining-workflow.js';

test('historical preparation or automatic approval alone does not authorize a new visit', () => {
  const state = { orders: [{ sessionId: 'visit', status: 'preparing' }, { sessionId: 'visit', status: 'approved', approvalType: 'automatic', approvedAt: '2026-10-23T00:00:00Z', approvedBy: 'untrusted' }] };
  assert.equal(initialApprovalFor(state, 'visit'), undefined);
  state.orders.push({ id: 'verified', sessionId: 'other', status: 'served', approvedAt: '2026-10-23T00:00:00Z', approvedBy: 'cashier' });
  assert.equal(initialApprovalFor(state, 'visit'), undefined);
  assert.equal(initialApprovalFor(state, 'other').id, 'verified');
});

test('one visit approval gates all phones and automatically routes later batches', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'restaurant-initial-approval-'));
  process.env.DATABASE_PATH = join(dir, 'approval.sqlite');
  for (const role of ['cashier', 'kitchen']) process.env[`${role.toUpperCase()}_PASSWORD`] = 'InitialTest@123';
  const { installDining } = await import('./dining.js'); const { default: db } = await import('./database.js');
  const app = express(); app.use(express.json()); installDining(app);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, body, cookie = '', token = '', method = 'POST') {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Visit-Token': token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const restart = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    await import('./server/dining.js');
    const { default: db } = await import('./server/database.js');
    process.stdout.write(db.prepare('SELECT body FROM dining_state WHERE id=1').get().body);
    db.close();
  `], { encoding: 'utf8', env: { ...process.env } }));
  let cashier, kitchen, visit, a, b, initial, queued, followUp;
  const state = async () => (await call('/dining/state', undefined, cashier)).data;
  const submit = (phone, requestId, menuItemId = 'add-1', quantity = 1) => call(`/dining/visits/${phone.id}/orders`, { requestId, items: [{ menuItemId, quantity }], approvalType: 'automatic', approvedBy: 'forged', initialBatchApproved: true }, '', phone.token);
  try {
    cashier = (await call('/staff/login', { username: 'cashier', password: 'InitialTest@123', role: 'cashier' })).cookie;
    kitchen = (await call('/staff/login', { username: 'kitchen', password: 'InitialTest@123', role: 'kitchen' })).cookie;
    visit = (await call('/dining/open', { tableNumber: 1, regularPax: 1, discountedPax: 0 }, cashier)).data;
    a = (await call('/dining/join', { tableNumber: 1, code: visit.code })).data;
    b = (await call('/dining/join', { tableNumber: 1, code: visit.code })).data;
    await t.test('multiple phones queue before approval and cannot forge or skip the first approval', async () => {
      initial = (await submit(a, 'first')).data;
      queued = (await submit(b, 'queued', 'add-2')).data;
      assert.equal(initial.status, 'submitted'); assert.equal(initial.approvalType, undefined);
      assert.equal(queued.status, 'submitted'); assert.equal(queued.approvedBy, undefined);
      assert.equal((await call('/dining/state', undefined, kitchen)).data.orders.length, 0);
      assert.equal((await call(`/dining/orders/${queued.id}/approve`, { expectedTotal: 35 }, cashier)).status, 409);
      assert.equal((await call(`/dining/orders/${initial.id}/approve`, { expectedTotal: 35 }, kitchen)).status, 403);
      assert.equal((await state()).sessions.find(s => s.id === visit.id).initialBatchApproved, false);
    });
    await t.test('cancelling the first batch leaves the next batch requiring an actual cashier approval', async () => {
      assert.equal((await call(`/dining/orders/${initial.id}/cancel`, { reason: 'Customer changed the initial selection' }, cashier)).status, 200);
      const waiting = await submit(a, 'replacement-queued', 'add-1', 2);
      assert.equal(waiting.data.status, 'submitted');
      const stock = (await state()).inventory.find(i => i.id === 'inv-13').currentStock;
      const approvals = await Promise.all([1, 2].map(() => call(`/dining/orders/${queued.id}/approve`, { expectedTotal: 35 }, cashier)));
      assert.ok(approvals.every(r => r.status === 200));
      const current = await state();
      assert.equal(current.orders.find(o => o.id === queued.id).approvalType, 'cashier');
      const released = current.orders.find(o => o.id === waiting.data.id);
      assert.equal(released.approvalType, 'automatic'); assert.equal(released.status, 'approved');
      assert.equal(released.initialApprovalOrderId, queued.id); assert.equal(released.approvedBy, undefined);
      assert.equal(current.inventory.find(i => i.id === 'inv-13').currentStock, stock);
      assert.equal(db.prepare("SELECT count(*) AS n FROM dining_events WHERE order_id=? AND event_type='batch_approved'").get(queued.id).n, 1);
      assert.equal((await call(`/dining/visits/${visit.id}`, undefined, '', b.token)).data.session.initialBatchApproved, true);
    });
    await t.test('follow-ups route immediately with retry-safe stock, system identity and immutable previous items', async () => {
      const before = await state();
      const responses = await Promise.all([1, 2].map(() => submit(b, 'direct-follow-up')));
      assert.ok(responses.every(r => r.status === 200));
      assert.equal(responses[0].data.id, responses[1].data.id); followUp = responses[0].data;
      assert.equal(followUp.status, 'approved'); assert.equal(followUp.approvalType, 'automatic');
      assert.equal(followUp.initialApprovalOrderId, queued.id); assert.equal(followUp.approvedBy, undefined);
      const current = await state();
      assert.equal(current.inventory.find(i => i.id === 'inv-13').currentStock, before.inventory.find(i => i.id === 'inv-13').currentStock - 1);
      assert.deepEqual(current.orders.find(o => o.id === queued.id).items, before.orders.find(o => o.id === queued.id).items);
      const events = (await call(`/dining/visits/${visit.id}/audit`, undefined, cashier)).data;
      const routing = events.filter(e => e.order_id === followUp.id && e.event_type === 'batch_approved');
      assert.equal(routing.length, 1); assert.equal(routing[0].actor_role, 'system'); assert.equal(routing[0].actor_id, null);
      assert.equal(routing[0].details.initialApprovalOrderId, queued.id);
      const persisted = JSON.parse(db.prepare('SELECT body FROM dining_state WHERE id=1').get().body);
      assert.deepEqual(restart(), persisted);
    });
    await t.test('cashier follow-ups are read-only, service blocks payment, and the next visit needs approval again', async () => {
      await call(`/dining/visits/${visit.id}/request-bill`, {}, '', a.token);
      assert.equal((await submit(b, 'paused')).status, 409);
      assert.equal((await call(`/dining/visits/${visit.id}/pay`, { paymentMethod: 'cash', amountReceived: 400, expectedTotal: 360 }, cashier)).status, 409);
      for (const order of (await state()).orders.filter(o => o.sessionId === visit.id && o.status !== 'cancelled')) {
        for (const status of ['preparing', 'ready']) assert.equal((await call(`/dining/orders/${order.id}`, { status }, kitchen, '', 'PATCH')).status, 200);
        if (order.approvalType === 'automatic') {
          assert.equal((await call(`/dining/orders/${order.id}`, { status: 'served' }, cashier, '', 'PATCH')).status, 403);
          assert.equal((await call(`/dining/orders/${order.id}/cancel`, { reason: 'Cannot alter dispatched food' }, cashier)).status, 409);
        }
        assert.equal((await call(`/dining/orders/${order.id}`, { status: 'served' }, kitchen, '', 'PATCH')).status, 200);
      }
      const paid = await call(`/dining/visits/${visit.id}/pay`, { paymentMethod: 'cash', amountReceived: 400, expectedTotal: 360 }, cashier);
      assert.equal(paid.status, 200); assert.equal(paid.data.totalBill, 360);
      assert.equal((await submit(a, 'closed')).status, 409);
      const next = (await call('/dining/open', { tableNumber: 1, regularPax: 1, discountedPax: 0 }, cashier)).data;
      const nextPhone = (await call('/dining/join', { tableNumber: 1, code: next.code })).data;
      const first = await submit(nextPhone, 'new-visit-first');
      assert.equal(first.data.status, 'submitted'); assert.equal(first.data.approvalType, undefined);
      assert.equal((await call(`/dining/visits/${next.id}`, undefined, '', nextPhone.token)).data.session.initialBatchApproved, false);
      assert.equal((await call('/dining/state', undefined, kitchen)).data.orders.length, 0);
    });
    await t.test('existing verified visits release old queued batches on startup without inventing a reviewer', async () => {
      const legacy = (await call('/dining/open', { tableNumber: 3, regularPax: 1, discountedPax: 0 }, cashier)).data;
      const phone = (await call('/dining/join', { tableNumber: 3, code: legacy.code })).data;
      const first = (await submit(phone, 'legacy-first')).data;
      await call(`/dining/orders/${first.id}/approve`, { expectedTotal: 35 }, cashier);
      const stored = JSON.parse(db.prepare('SELECT body FROM dining_state WHERE id=1').get().body);
      const stockBefore = structuredClone(stored.inventory);
      stored.orders.push({ ...first, id: 'legacy-queued', requestId: 'legacy-queued', batchNumber: 2, items: [{ menuItemId: 'meat-0', name: 'Pork Belly (Plain)', quantity: 1, price: 0 }], totalAmount: 0, reservedStock: {}, history: [{ status: 'submitted', actorRole: 'customer', at: first.timeOrdered }] });
      db.prepare('UPDATE dining_state SET body=? WHERE id=1').run(JSON.stringify(stored));
      const migrated = restart(); const released = migrated.orders.find(o => o.id === 'legacy-queued');
      assert.equal(released.status, 'approved'); assert.equal(released.approvalType, 'automatic'); assert.equal(released.approvedBy, undefined);
      assert.equal(released.initialApprovalOrderId, first.id); assert.deepEqual(migrated.inventory, stockBefore);
      assert.deepEqual(restart(), migrated);
    });
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); }
});
