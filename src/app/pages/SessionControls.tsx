import { useEffect, useState } from 'react';
import type { DiningSession } from '../context/RestaurantContext';
import { useRestaurant } from '../context/RestaurantContext';
import { api } from '../lib/api';
import { statusLabel } from '../lib/orderStatus';

const money = (n: number) => `₱${n.toLocaleString()}`;
export function AuditTrail({ sessionId }: { sessionId: string }) {
  const [events, setEvents] = useState<any[] | null>(null); const [error, setError] = useState('');
  return <details className="audit-trail" onToggle={async e => { if (!e.currentTarget.open) return; try { setEvents(await api(`/dining/visits/${sessionId}/audit`)); setError(''); } catch (e) { setError((e as Error).message); } }}><summary>Session audit trail</summary>{error && <p className="error">{error}</p>}{events?.length === 0 && <p>No workflow events recorded before this upgrade.</p>}{events?.map(event => <p key={event.id}>{event.event_type.replaceAll('_', ' ')} · {event.actor_name || event.actor_role} · {new Date(event.timestamp).toLocaleString()}</p>)}</details>;
}
export default function SessionControls({ visit, busy, action }: { visit: DiningSession; busy: boolean; action: (path: string, body: unknown, method?: string) => Promise<boolean> }) {
  const { orders } = useRestaurant();
  const batches = orders.filter(o => o.sessionId === visit.id);
  const firstPending = !visit.initialBatchApproved ? batches.find(o => o.status === 'submitted')?.id : undefined;
  const [method, setMethod] = useState('cash'); const [cash, setCash] = useState(''); const [reference, setReference] = useState('');
  const [discount, setDiscount] = useState(String(visit.discountAmount || 0)); const [discountReason, setDiscountReason] = useState(visit.discountReason || '');
  useEffect(() => { setDiscount(String(visit.discountAmount || 0)); setDiscountReason(visit.discountReason || ''); }, [visit.id, visit.discountAmount, visit.discountReason]);
  return <div className="staff-visit"><p>Visit code: <strong className="success">{visit.code}</strong></p><p>{visit.regularPax} regular · {visit.discountedPax} discounted</p>
    <div className="bill-line"><span>Package (once per visit)</span><strong>{money(visit.packageTotal)}</strong></div><div className="bill-line"><span>Batch extras (excluding cancelled)</span><strong>{money(visit.additionalTotal)}</strong></div>{visit.discountAmount > 0 && <div className="bill-line"><span>Discount: {visit.discountReason}</span><strong>−{money(visit.discountAmount)}</strong></div>}<div className="bill-line"><h2>Final bill</h2><h2>{money(visit.total)}</h2></div>
    <h3 className="batch-heading">Review every batch</h3>{!batches.length && <p>No batches submitted yet.</p>}
    {batches.map(o => <section className="session-batch" key={o.id} data-batch-id={o.id}><div className="bill-line"><strong>Batch {o.batchNumber}</strong><span className={`batch-status ${o.status}`}>{statusLabel[o.status]}</span></div>{o.items.map((i,n) => <p key={n}>{i.quantity} × {i.name} · {money(i.price)} each · {money(i.quantity * i.price)}</p>)}<p>Batch extras total: {money(o.totalAmount)}</p>{o.customerNotes && <p>Instructions: {o.customerNotes}</p>}{o.approvedByName && <p className="success">Verified by {o.approvedByName}</p>}{o.cancellationReason && <p>Cancelled: {o.cancellationReason}</p>}
      {o.approvalType === 'automatic' && <p className="success">Sent directly to kitchen · Read-only record</p>}
      {o.status === 'submitted' && o.id !== firstPending && <p>Queued until the first batch is approved.</p>}
      {o.status === 'submitted' && o.id === firstPending && <button disabled={busy} onClick={() => action(`/dining/orders/${o.id}/approve`, { expectedTotal: o.totalAmount })}>Approve & send to kitchen</button>}
      {o.status === 'ready' && o.approvalType !== 'automatic' && <button disabled={busy} onClick={() => action(`/dining/orders/${o.id}`, { status: 'served' }, 'PATCH')}>Confirm delivered & mark served</button>}
    </section>)}
    <details><summary>Additional bill discount</summary><form onSubmit={e => { e.preventDefault(); action(`/dining/visits/${visit.id}/discount`, { amount: Number(discount), reason: discountReason }, 'PATCH'); }}><label>Discount amount<input type="number" min={0} max={visit.grossTotal} step="0.01" required value={discount} onChange={e => setDiscount(e.target.value)} /></label><label>Discount reason<input required={Number(discount) > 0} minLength={Number(discount) > 0 ? 3 : undefined} maxLength={500} value={discountReason} onChange={e => setDiscountReason(e.target.value)} /></label><p>Guest package discounts are already included above. Apply any additional discount only once here.</p><button disabled={busy}>Save discount</button></form></details>
    {visit.status === 'open' ? <button disabled={busy} onClick={() => action(`/dining/staff/visits/${visit.id}/request-bill`, {})}>Finish ordering & request bill</button> : <><p className="notice">Ordering is paused for final review.</p><button className="secondary" disabled={busy} onClick={() => action(`/dining/visits/${visit.id}/reopen`, {})}>Reopen ordering</button>
      {visit.blockers.length > 0 && <p className="notice error" role="status">Cannot close: {visit.blockers.map(o => `Batch ${o.batchNumber} (${statusLabel[o.status]})`).join(', ')}. Every batch must be served or cancelled before approval.</p>}
      <form onSubmit={async e => { e.preventDefault(); if (!visit.canClose) return; const ok = await action(`/dining/visits/${visit.id}/pay`, { paymentMethod: method, amountReceived: Number(cash), reference, expectedTotal: visit.total }); if (ok) { setCash(''); setReference(''); } }}><label>Payment method<select value={method} disabled={busy} onChange={e => setMethod(e.target.value)}><option value="cash">Cash</option><option value="online">Verified online payment</option></select></label>{method === 'cash' ? <><label>Cash received<input type="number" min={visit.total} step="0.01" required value={cash} disabled={busy} onChange={e => setCash(e.target.value)} /></label><p>Change: {money(Math.max(0, Number(cash) - visit.total))}</p></> : <label>Verified payment reference<input minLength={5} maxLength={200} required value={reference} disabled={busy} onChange={e => setReference(e.target.value)} /></label>}
      <p>Review all batches and discounts. Confirm only after every item is delivered and payment is received or verified.</p><button disabled={busy || !visit.canClose}>Confirm payment & close visit</button></form></>}
    <AuditTrail sessionId={visit.id} />
  </div>;
}
