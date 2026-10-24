import { randomUUID, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import database from './database.js';
import { installAuth, staffOnly, roles } from './auth.js';
import { migrateState, billFor, installAudit, kitchenStatuses, initialApprovalFor, firstSubmittedFor } from './dining-workflow.js';

const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
// New products carry their stock link in SQLite; retain the original recipe rules.
function stockRule(menu) {
  return menu.inventoryId ? { inventoryId: menu.inventoryId, amount: menu.stockPerOrder } : seed.rules[menu.name];
}
function visibleOnMenu(state, menu) {
  const rule = stockRule(menu);
  const inventory = rule && state.inventory.find(i => i.id === rule.inventoryId);
  return !inventory?.hiddenFromMenu && !inventory?.archived;
}
function textField(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) fail(`Enter a valid ${label} (1–${maxLength} characters)`);
  return value.trim().replace(/\s+/g, ' ');
}
function stockNumber(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum || value > 100000000 || Math.abs(value * 10000 - Math.round(value * 10000)) > 0.00001) fail(`${label} must be between ${minimum} and 100000000 with at most four decimal places`);
  return value;
}

const attempts = new Map();
function limitAttempts(req, res, next) {
  const key = `${req.ip}:${req.path}`; const now = Date.now();
  for (const [k, entry] of attempts) if (entry.until < now) attempts.delete(k);
  const entry = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
  if (entry.count >= 30) return res.status(429).json({ error: 'Too many attempts. Please try again in 15 minutes.' });
  attempts.set(key, entry);
  res.on('finish', () => { if (res.statusCode === 400 || res.statusCode === 401) entry.count++; });
  next();
}
database.exec('CREATE TABLE IF NOT EXISTS dining_state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)');
if (!database.prepare('SELECT id FROM dining_state WHERE id=1').get()) {
  database.prepare('INSERT INTO dining_state VALUES(1,?)').run(JSON.stringify({
    tables: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, qrCode: `TABLE-${i + 1}`, status: 'available' })),
    sessions: [], orders: [], transactions: [], inventory: seed.inventory, inventoryMovements: [], menu: seed.menu,
  }));
}
function read() { return JSON.parse(database.prepare('SELECT body FROM dining_state WHERE id=1').get().body); }
function mutate(fn) { return database.transaction(() => { const state = read(); const result = fn(state); database.prepare('UPDATE dining_state SET body=? WHERE id=1').run(JSON.stringify(state)); return result; })(); }
installAudit(database);
database.transaction(() => {
  const state = read();
  let changed = migrateState(state);
  if (changed) {
    for (const visit of state.sessions) audit({ staff: { role: 'system', id: null, username: 'workflow migration' } }, visit.id, 'workflow_migrated', { version: 2, preservedLegacyHistory: true });
  }
  // Existing verified visits adopt follow-up routing without inventing past staff approvals.
  for (const visit of state.sessions.filter(s => s.status !== 'closed')) {
    const initial = initialApprovalFor(state, visit.id);
    if (initial && routeFollowUps(state, visit.id, initial)) changed = true;
  }
  if (changed) database.prepare('UPDATE dining_state SET body=? WHERE id=1').run(JSON.stringify(state));
})();
function audit(req, visitId, type, details = {}, orderId = null) {
  const event = { id: randomUUID(), timestamp: new Date().toISOString(), actorRole: req.staff?.role || 'customer', actorId: req.staff?.id || null, actorName: req.staff?.username || null, type, details };
  database.prepare('INSERT INTO dining_events VALUES(?,?,?,?,?,?,?,?,?)').run(event.id, visitId, orderId, type, event.actorRole, event.actorId, event.actorName, event.timestamp, JSON.stringify(details));
  return event;
}
function recordStatus(req, order, status, details = {}) {
  const from = order.status; order.status = status;
  const event = audit(req, order.sessionId, `batch_${status}`, { from, to: status, ...details }, order.id);
  order.history ??= []; order.history.push({ status, at: event.timestamp, actorRole: event.actorRole, actorName: event.actorName, ...details });
  return event;
}
function routeFollowUps(state, sessionId, initial) {
  let count = 0;
  for (const order of state.orders.filter(o => o.sessionId === sessionId && o.status === 'submitted')) {
    const event = recordStatus({ staff: { role: 'system', id: null, username: 'Automatic kitchen routing' } }, order, 'approved', { approvalType: 'automatic', initialApprovalOrderId: initial.id });
    order.approvalType = 'automatic'; order.initialApprovalOrderId = initial.id; order.approvedAt = event.timestamp;
    count++;
  }
  return count;
}
function session(state, id) { return state.sessions.find(s => s.id === id) || fail('Visit not found', 404); }
function customer(req, state) {
  const s = session(state, req.params.id);
  if (!s.tokens.includes(req.headers['x-visit-token'])) fail('Scan the table QR and enter the visit code', 401);
  return s;
}
function view(state, s) {
  const orders = state.orders.filter(o => o.sessionId === s.id);
  return { session: { id: s.id, tableNumber: s.tableNumber, status: s.status, regularPax: s.regularPax, discountedPax: s.discountedPax, packageTotal: s.packageTotal, initialBatchApproved: Boolean(initialApprovalFor(state, s.id)) },
    orders: orders.map(({ reservedStock, requestId, ...o }) => o), ...billFor(state, s), menu: state.menu.filter(m => visibleOnMenu(state, m)).map(m => {
      const rule = stockRule(m); const inv = rule && state.inventory.find(i => i.id === rule.inventoryId);
      return { ...m, available: m.available && (!rule || (inv && !inv.archived && inv.currentStock >= rule.amount)) };
    }) };
}
export function installDining(app) {
  installAuth(app);
  const managers = roles('cashier', 'owner');
  app.use('/api/dining', (req, res, next) => {
    if (['POST', 'PATCH'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ error: 'Provide a JSON object' });
    next();
  });
  app.get('/api/dining/state', staffOnly, (req, res) => {
    const state = read();
    const activeSessions = new Set(state.sessions.filter(s => s.status !== 'closed').map(s => s.id));
    state.sessions = state.sessions.map(({ tokens, ...s }) => ({ ...s, ...billFor(state, s), initialBatchApproved: Boolean(initialApprovalFor(state, s.id)) }));
    if (req.staff.role === 'kitchen') {
      state.sessions = []; state.transactions = []; state.inventory = []; state.inventoryMovements = []; state.menu = [];
      state.orders = state.orders.filter(o => kitchenStatuses.includes(o.status) && activeSessions.has(o.sessionId)).map(({ reservedStock, requestId, ...o }) => ({ ...o, totalAmount: 0, history: (o.history || []).map(({ status, at, actorRole, actorName }) => ({ status, at, actorRole, actorName })), items: o.items.map(i => ({ ...i, price: 0 })) }));
    }
    res.set('Cache-Control', 'no-store').json(state);
  });
  app.get('/api/dining/tables/:id', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = Number(req.params.id);
    const table = Number.isSafeInteger(id) && id > 0 && read().tables.find(t => t.id === id && !t.hidden);
    if (!table) return res.status(404).json({ error: 'This table is unavailable. Please ask staff for another table.' });
    res.json({ id: table.id });
  });
  app.post('/api/dining/tables', managers, (req, res) => res.status(201).json(mutate(state => {
    if (Object.keys(req.body).length) fail('Table numbers are assigned automatically');
    const id = state.tables.reduce((highest, table) => Math.max(highest, table.id), 0) + 1;
    if (!Number.isSafeInteger(id)) fail('No further automatic table numbers are available', 409);
    const table = { id, qrCode: `TABLE-${id}`, status: 'available', hidden: false, createdAt: new Date().toISOString(), createdBy: req.staff.id };
    state.tables.push(table);
    return table;
  })));
  app.patch('/api/dining/tables/:id', managers, (req, res) => res.json(mutate(state => {
    const table = state.tables.find(t => t.id === Number(req.params.id)) || fail('Table not found', 404);
    if (Object.keys(req.body).length !== 1 || typeof req.body.hidden !== 'boolean') fail('Provide only a true or false hidden value');
    if (req.body.hidden && (table.status !== 'available' || state.sessions.some(s => s.tableNumber === table.id && s.status !== 'closed'))) fail('Close the active visit before hiding this table. Only available tables can be hidden.', 409);
    table.hidden = req.body.hidden;
    table.visibilityUpdatedAt = new Date().toISOString(); table.visibilityUpdatedBy = req.staff.id;
    return table;
  })));
  app.post('/api/dining/open', managers, (req, res) => res.json(mutate(state => {
    const { tableNumber, regularPax, discountedPax } = req.body;
    const table = state.tables.find(t => t.id === tableNumber);
    if (!table) fail('Choose an existing table');
    if (table.hidden) fail('This table is hidden. Show the table before opening a visit.', 409);
    if (state.sessions.some(s => s.tableNumber === tableNumber && s.status !== 'closed')) fail('This table already has an active visit', 409);
    if (![regularPax, discountedPax].every(n => Number.isInteger(n) && n >= 0) || regularPax + discountedPax < 1 || regularPax + discountedPax > 50) fail('Enter 1–50 guests');
    let code; do { code = String(randomInt(100000, 1000000)); } while (state.sessions.some(s => s.tableNumber === tableNumber && s.code === code));
    const s = { id: randomUUID(), tableNumber, regularPax, discountedPax, packageTotal: regularPax * 220 + discountedPax * 195, code, tokens: [], status: 'open', openedAt: new Date().toISOString() };
    state.sessions.push(s); table.status = 'occupied'; audit(req, s.id, 'session_opened', { tableNumber, regularPax, discountedPax, packageTotal: s.packageTotal }); return s;
  })));
  app.post('/api/dining/join', limitAttempts, (req, res) => res.json(mutate(state => {
    const tableNumber = Number(req.body.tableNumber);
    const table = state.tables.find(t => t.id === tableNumber && !t.hidden);
    const s = table && state.sessions.find(s => s.tableNumber === tableNumber && s.status !== 'closed');
    if (!s || s.code !== String(req.body.code)) fail('No active visit with this code. Ask your server.', 401);
    const token = randomUUID(); s.tokens.push(token); return { id: s.id, token };
  })));
  app.get('/api/dining/visits/:id', (req, res) => { const state = read(); res.json(view(state, customer(req, state))); });
  app.post('/api/dining/visits/:id/orders', (req, res) => res.json(mutate(state => {
    const s = customer(req, state);
    const { items, requestId, notes = '' } = req.body;
    if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100) fail('Missing order request ID');
    const prior = state.orders.find(o => o.sessionId === s.id && o.requestId === requestId); if (prior) return prior;
    if (s.status !== 'open') fail('Ordering is paused or this visit has ended', 409);
    if (!Array.isArray(items) || !items.length || items.length > 50 || typeof notes !== 'string' || notes.length > 1000) fail('Invalid order');
    const demand = {}; const normalized = items.map(item => {
      if (!item || typeof item !== 'object') fail('Invalid order item');
      const menu = state.menu.find(m => m.id === item.menuItemId && m.available && visibleOnMenu(state, m));
      if (!menu || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) fail('Invalid menu item or quantity');
      const rule = stockRule(menu); if (rule) demand[rule.inventoryId] = (demand[rule.inventoryId] || 0) + rule.amount * item.quantity;
      return { menuItemId: menu.id, name: menu.name, price: menu.price, quantity: item.quantity };
    });
    for (const [id, amount] of Object.entries(demand)) {
      const inv = state.inventory.find(i => i.id === id && !i.archived);
      if (!inv || inv.currentStock + 0.00001 < amount) fail(`Insufficient stock: ${inv?.name || id}`, 409);
    }
    const order = { id: randomUUID(), requestId, sessionId: s.id, tableNumber: s.tableNumber, batchNumber: state.orders.filter(o => o.sessionId === s.id).length + 1, items: normalized, status: 'submitted', timeOrdered: new Date().toISOString(), totalAmount: Number(normalized.reduce((n, i) => n + i.price * i.quantity, 0).toFixed(2)), customerNotes: notes, reservedStock: demand, history: [] };
    for (const [id, amount] of Object.entries(demand)) {
      const inv = state.inventory.find(i => i.id === id); inv.currentStock = Number((inv.currentStock - amount).toFixed(4)); inv.lastUpdated = order.timeOrdered;
      state.inventoryMovements.unshift({ id: randomUUID(), itemId: id, itemName: inv.name, type: 'deduction', quantity: amount, unit: inv.unit, reason: 'Reserved for submitted batch', orderId: order.id, tableNumber: s.tableNumber, timestamp: order.timeOrdered });
    }
    state.orders.push(order); recordStatus(req, order, 'submitted', { items: normalized, totalAmount: order.totalAmount, notes });
    const initial = initialApprovalFor(state, s.id);
    if (initial) routeFollowUps(state, s.id, initial);
    return order;
  })));
  app.post('/api/dining/visits/:id/request-bill', (req, res) => res.json(mutate(state => {
    const s = customer(req, state); if (s.status === 'closed') fail('Visit has ended', 409);
    if (s.status !== 'pending_payment') audit(req, s.id, 'bill_requested');
    s.status = 'pending_payment'; state.tables.find(t => t.id === s.tableNumber).status = 'pending_payment'; return view(state, s);
  })));
  app.post('/api/dining/visits/:id/reopen', managers, (req, res) => res.json(mutate(state => {
    const s = session(state, req.params.id); if (s.status === 'closed') fail('Closed visits cannot be reopened', 409); if (s.status !== 'open') audit(req, s.id, 'ordering_reopened'); s.status = 'open'; state.tables.find(t => t.id === s.tableNumber).status = 'occupied'; return s;
  })));
  app.post('/api/dining/staff/visits/:id/request-bill', managers, (req, res) => res.json(mutate(state => {
    const s = session(state, req.params.id); if (s.status === 'closed') fail('Visit has ended', 409);
    if (s.status !== 'pending_payment') audit(req, s.id, 'bill_requested');
    s.status = 'pending_payment'; state.tables.find(t => t.id === s.tableNumber).status = 'pending_payment'; return s;
  })));
  app.post('/api/dining/visits/:id/pay', managers, (req, res) => res.json(mutate(state => {
    const s = session(state, req.params.id); if (s.status === 'closed') return state.transactions.find(t => t.sessionId === s.id);
    if (s.status !== 'pending_payment') fail('Request the bill before taking payment');
    const bill = billFor(state, s);
    if (bill.blockers.length) fail('Cannot close: every batch must be approved, prepared and served, or cancelled before approval', 409);
    const total = bill.total; const { paymentMethod, amountReceived, reference, expectedTotal } = req.body;
    if (!Number.isFinite(expectedTotal) || expectedTotal !== total) fail('Bill changed. Review the current total before confirming payment.', 409);
    if (!['cash', 'online'].includes(paymentMethod)) fail('Select a payment method');
    if (paymentMethod === 'cash' && (!Number.isFinite(amountReceived) || amountReceived < total || Math.abs(Math.round(amountReceived * 100) - amountReceived * 100) > 0.000001)) fail('Enter a valid cash amount at least equal to the bill');
    if (paymentMethod === 'online' && (typeof reference !== 'string' || reference.trim().length < 5 || reference.length > 200)) fail('Enter a verified payment reference (5–200 characters)');
    const txn = { id: randomUUID(), sessionId: s.id, tableNumber: s.tableNumber, totalBill: total, grossTotal: bill.grossTotal, discountAmount: bill.discountAmount, discountReason: bill.discountReason, packageTotal: s.packageTotal, batchIds: state.orders.filter(o => o.sessionId === s.id && o.status !== 'cancelled').map(o => o.id), paymentMethod, amountReceived: paymentMethod === 'cash' ? amountReceived : total, change: paymentMethod === 'cash' ? amountReceived - total : 0, reference: paymentMethod === 'online' ? reference.trim() : null, confirmedBy: req.staff.id, confirmedByName: req.staff.username, timestamp: new Date().toISOString() };
    txn.change = Number(txn.change.toFixed(2));
    state.transactions.unshift(txn); s.status = 'closed'; s.closedAt = txn.timestamp;
    audit(req, s.id, 'payment_confirmed', txn); audit(req, s.id, 'session_closed', { transactionId: txn.id, total });
    state.tables.find(t => t.id === s.tableNumber).status = 'available'; return txn;
  })));
  app.post('/api/dining/orders/:id/approve', managers, (req, res) => res.json(mutate(state => {
    const order = state.orders.find(o => o.id === req.params.id) || fail('Batch not found', 404);
    if (session(state, order.sessionId).status === 'closed') fail('This visit is closed', 409);
    if (order.approvedAt) return order;
    if (order.status !== 'submitted') fail('Only submitted batches can be approved', 409);
    const initial = initialApprovalFor(state, order.sessionId);
    if (initial) { routeFollowUps(state, order.sessionId, initial); return order; }
    if (firstSubmittedFor(state, order.sessionId)?.id !== order.id) fail('Approve the first pending batch for this visit. Later batches will be sent automatically.', 409);
    if (req.body.expectedTotal !== order.totalAmount) fail('Review this batch total before approving it', 409);
    const event = recordStatus(req, order, 'approved', { verifiedTotal: order.totalAmount, approvalType: 'cashier' });
    order.approvalType = 'cashier';
    order.approvedAt = event.timestamp; order.approvedBy = req.staff.id; order.approvedByName = req.staff.username;
    routeFollowUps(state, order.sessionId, order);
    return order;
  })));
  app.post('/api/dining/orders/:id/cancel', managers, (req, res) => res.json(mutate(state => {
    const order = state.orders.find(o => o.id === req.params.id) || fail('Batch not found', 404);
    const visit = session(state, order.sessionId);
    if (visit.status === 'closed') fail('This visit is closed', 409);
    if (order.status === 'cancelled') return order;
    if (order.status !== 'submitted') fail('Approved batches cannot be cancelled or modified', 409);
    const reason = req.body.reason;
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 1000) fail('Enter a cancellation reason (3–1000 characters)');
    const reserved = order.reservedStock || order.items.reduce((result, item) => {
      const menu = state.menu.find(m => m.id === item.menuItemId);
      const rule = menu ? stockRule(menu) : seed.rules[item.name]; if (rule) result[rule.inventoryId] = (result[rule.inventoryId] || 0) + rule.amount * item.quantity;
      return result;
    }, {});
    const event = recordStatus(req, order, 'cancelled', { reason: reason.trim() }); order.cancellationReason = reason.trim();
    for (const [id, amount] of Object.entries(reserved)) {
      const inv = state.inventory.find(i => i.id === id) || fail('Reserved inventory is missing', 409);
      inv.currentStock = Number((inv.currentStock + amount).toFixed(4)); inv.lastUpdated = event.timestamp;
      state.inventoryMovements.unshift({ id: randomUUID(), itemId: id, itemName: inv.name, type: 'restock', quantity: amount, unit: inv.unit, reason: 'Released cancelled batch reservation', orderId: order.id, tableNumber: order.tableNumber, timestamp: event.timestamp });
    }
    if (billFor(state, visit).total < 0) fail('Reduce the session discount before cancelling this batch', 409);
    return order;
  })));
  app.patch('/api/dining/visits/:id/discount', managers, (req, res) => res.json(mutate(state => {
    const visit = session(state, req.params.id); if (visit.status === 'closed') fail('This visit is closed', 409);
    const { amount, reason } = req.body;
    if (!Number.isFinite(amount) || amount < 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001 || amount > billFor(state, visit).grossTotal) fail('Discount must be a valid amount within the gross bill');
    if (amount && (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500)) fail('Enter a discount reason (3–500 characters)');
    audit(req, visit.id, 'discount_updated', { previousAmount: visit.discountAmount || 0, amount, reason: amount ? reason.trim() : '' });
    visit.discountAmount = amount; visit.discountReason = amount ? reason.trim() : ''; return billFor(state, visit);
  })));
  app.get('/api/dining/visits/:id/audit', managers, (req, res) => {
    session(read(), req.params.id);
    const events = database.prepare('SELECT * FROM dining_events WHERE session_id=? ORDER BY rowid').all(req.params.id).map(({ details_json, ...event }) => ({ ...event, details: JSON.parse(details_json) }));
    res.set('Cache-Control', 'no-store').json(events);
  });
  app.patch('/api/dining/orders/:id', roles('kitchen', 'owner', 'cashier'), (req, res) => res.json(mutate(state => {
    if (req.staff.role === 'cashier' && req.body.status !== 'served') fail('Cashiers may mark ready batches served; kitchen preparation requires kitchen staff', 403);
    if (Object.keys(req.body).some(key => key !== 'status')) fail('Only the batch status can be changed');
    const order = state.orders.find(o => o.id === req.params.id) || fail('Order not found', 404);
    if (req.staff.role === 'cashier' && order.approvalType === 'automatic') fail('Follow-up batches are read-only for cashiers. Kitchen staff confirm preparation and service.', 403);
    if (session(state, order.sessionId).status === 'closed') fail('This visit is closed', 409);
    if (!kitchenStatuses.includes(order.status)) fail('Cashier approval is required before kitchen preparation', 409);
    if (req.body.status === order.status) return order;
    const next = { approved: 'preparing', preparing: 'ready', ready: 'served' };
    if (typeof req.body.status !== 'string' || next[order.status] !== req.body.status) fail('Invalid order status transition', 409);
    recordStatus(req, order, req.body.status); return order;
  })));
  app.post('/api/dining/inventory', managers, (req, res) => res.status(201).json(mutate(state => {
    const allowed = ['name', 'category', 'price', 'description', 'unit', 'currentStock', 'lowStockThreshold', 'stockPerOrder', 'hiddenFromMenu'];
    if (Object.keys(req.body).some(key => !allowed.includes(key))) fail('Unknown product field');
    const name = textField(req.body.name, 'product name', 100);
    const category = textField(req.body.category, 'category', 60);
    const unit = textField(req.body.unit, 'stock unit', 30);
    const normalizedName = name.toLowerCase();
    if ([...state.menu, ...state.inventory].some(i => i.name.trim().replace(/\s+/g, ' ').toLowerCase() === normalizedName)) fail('An item with this name already exists, including archived items', 409);
    const { price, description = '', hiddenFromMenu = false } = req.body;
    if (!Number.isFinite(price) || price < 0 || price > 1000000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) fail('Price must be between 0 and 1000000 with at most two decimal places');
    if (typeof description !== 'string' || description.length > 1000) fail('Description must be at most 1000 characters');
    if (typeof hiddenFromMenu !== 'boolean') fail('Invalid menu visibility');
    const currentStock = stockNumber(req.body.currentStock, 'Stock');
    const lowStockThreshold = stockNumber(req.body.lowStockThreshold, 'Low stock threshold');
    const stockPerOrder = stockNumber(req.body.stockPerOrder, 'Stock used per order', 0.0001);
    const now = new Date().toISOString();
    const inventory = { id: `inv-${randomUUID()}`, name, currentStock, unit, lowStockThreshold, lastUpdated: now, hiddenFromMenu, createdAt: now, createdBy: req.staff.id, createdByName: req.staff.username };
    const menu = { id: `product-${randomUUID()}`, name, category, price, description: description.trim(), available: true, inventoryId: inventory.id, stockPerOrder };
    state.inventory.push(inventory); state.menu.push(menu);
    if (currentStock) state.inventoryMovements.unshift({ id: randomUUID(), itemId: inventory.id, itemName: name, type: 'restock', quantity: currentStock, unit, reason: 'Opening stock for new product', timestamp: now, actorId: req.staff.id, actorName: req.staff.username });
    return { inventory, menu };
  })));
  app.patch('/api/dining/inventory/:id', managers, (req, res) => res.json(mutate(state => {
    const item = state.inventory.find(i => i.id === req.params.id) || fail('Item not found', 404);
    if (Object.keys(req.body).some(key => !['currentStock', 'archived', 'hiddenFromMenu'].includes(key))) fail('Unknown inventory field');
    if ('currentStock' in req.body) {
      const stock = req.body.currentStock; if (!Number.isFinite(stock) || stock < 0) fail('Stock must be a nonnegative number');
      const diff = stock - item.currentStock;
      if (diff) state.inventoryMovements.unshift({ id: randomUUID(), itemId: item.id, itemName: item.name, type: diff > 0 ? 'restock' : 'deduction', quantity: Math.abs(diff), unit: item.unit, reason: 'Staff stock adjustment', timestamp: new Date().toISOString(), actorId: req.staff.id, actorName: req.staff.username });
      item.currentStock = stock;
    }
    if ('archived' in req.body) { if (typeof req.body.archived !== 'boolean') fail('Invalid archive value'); item.archived = req.body.archived; item.archivedAt = item.archived ? new Date().toISOString() : null; }
    if ('hiddenFromMenu' in req.body) {
      if (typeof req.body.hiddenFromMenu !== 'boolean') fail('Invalid menu visibility');
      item.hiddenFromMenu = req.body.hiddenFromMenu;
      item.visibilityUpdatedAt = new Date().toISOString(); item.visibilityUpdatedBy = req.staff.id;
    }
    item.lastUpdated = new Date().toISOString(); return item;
  })));
}
