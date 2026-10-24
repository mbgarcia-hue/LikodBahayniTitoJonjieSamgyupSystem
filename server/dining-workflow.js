export const WORKFLOW_VERSION = 2;
export const kitchenStatuses = ['approved', 'preparing', 'ready', 'served'];
export function initialApprovalFor(state, sessionId) {
  return state.orders.find(order => order.sessionId === sessionId && order.approvedAt && order.approvedBy && order.approvalType !== 'automatic' && (kitchenStatuses.includes(order.status) || order.status === 'completed'));
}
export function firstSubmittedFor(state, sessionId) {
  return state.orders.find(order => order.sessionId === sessionId && order.status === 'submitted');
}
export function migrateState(state) {
  if (state.workflowVersion >= WORKFLOW_VERSION) return false;
  const numbers = new Map();
  for (const order of state.orders) {
    const number = (numbers.get(order.sessionId) || 0) + 1; numbers.set(order.sessionId, number);
    order.batchNumber ??= number;
    order.history ??= [];
    order.legacyWorkflow = true;
    if (order.status === 'pending') { order.legacyStatus = 'pending'; order.status = 'submitted'; }
    // Retain historical preparation/payment statuses; never invent staff approvals.
  }
  state.workflowVersion = WORKFLOW_VERSION;
  return true;
}
export function billFor(state, visit) {
  const orders = state.orders.filter(o => o.sessionId === visit.id);
  const additionalTotal = orders.filter(o => o.status !== 'cancelled').reduce((n, o) => n + o.totalAmount, 0);
  const grossTotal = visit.packageTotal + additionalTotal;
  const discountAmount = visit.discountAmount || 0;
  const blockers = orders.filter(o => !['served', 'cancelled'].includes(o.status));
  return { additionalTotal, grossTotal, discountAmount, discountReason: visit.discountReason || '', total: Number((grossTotal - discountAmount).toFixed(2)), blockers: blockers.map(o => ({ id: o.id, batchNumber: o.batchNumber, status: o.status })), canClose: visit.status === 'pending_payment' && blockers.length === 0 };
}
export function installAudit(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS dining_events (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, order_id TEXT, event_type TEXT NOT NULL,
    actor_role TEXT NOT NULL, actor_id TEXT, actor_name TEXT, timestamp TEXT NOT NULL, details_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS dining_events_session ON dining_events(session_id);
  CREATE TRIGGER IF NOT EXISTS dining_events_no_update BEFORE UPDATE ON dining_events BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS dining_events_no_delete BEFORE DELETE ON dining_events BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;`);
}
