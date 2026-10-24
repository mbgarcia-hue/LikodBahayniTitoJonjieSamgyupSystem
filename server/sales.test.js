import test from 'node:test';
import assert from 'node:assert/strict';
import { salesSummary, dayKey } from '../src/app/lib/sales.js';
test('sales use confirmed transactions, Manila day boundaries and paid-session products', () => {
  const tx = [{ sessionId: 'paid', totalBill: 255, timestamp: '2026-10-21T16:30:00Z' }, { sessionId: 'old', totalBill: 999, timestamp: '2026-09-01T00:00:00Z' }];
  const orders = [{ sessionId: 'paid', items: [{ name: 'Coke', quantity: 1, price: 35 }] }, { sessionId: 'unpaid', items: [{ name: 'Coke', quantity: 20, price: 35 }] }, { sessionId: 'paid', status: 'cancelled', items: [{ name: 'Coke', quantity: 99, price: 35 }] }];
  const summary = salesSummary(tx, orders, new Date('2026-10-22T04:00:00Z'));
  assert.equal(dayKey(tx[0].timestamp), '2026-10-22'); assert.equal(summary.totalRevenue, 255); assert.equal(summary.todaySales, 255); assert.equal(summary.salesData.length, 7); assert.deepEqual(summary.bestSellingProducts, [{ name: 'Coke', sold: 1, revenue: 35 }]);
  const empty = salesSummary([], [], new Date('2026-10-22')); assert.equal(empty.totalRevenue, 0); assert.ok(empty.salesData.every(d => d.sales === 0));
});
