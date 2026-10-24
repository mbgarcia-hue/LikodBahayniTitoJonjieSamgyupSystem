import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { toast } from 'sonner';
import { useRestaurant } from '../context/RestaurantContext';
import { api } from '../lib/api';
import { statusLabel } from '../lib/orderStatus';

export default function BatchReview() {
  const { orders, sessions, refresh } = useRestaurant();
  const base = useLocation().pathname.startsWith('/admin') ? '/admin' : '/cashier';
  const [filter, setFilter] = useState('active'); const [busy, setBusy] = useState('');
  const [cancelling, setCancelling] = useState(''); const [reason, setReason] = useState('');
  const activeSessions = new Set(sessions.filter(s => s.status !== 'closed').map(s => s.id));
  const needsReview = (order: typeof orders[number]) => order.status === 'submitted' && activeSessions.has(order.sessionId) && !sessions.find(s => s.id === order.sessionId)?.initialBatchApproved && orders.find(o => o.sessionId === order.sessionId && o.status === 'submitted')?.id === order.id;
  const visible = [...orders].reverse().filter(o => filter === 'history' || (activeSessions.has(o.sessionId) && (filter === 'active' || needsReview(o))));
  async function action(id: string, path: string, body: unknown, method = 'POST') {
    if (busy) return; setBusy(id);
    try { await api(path, body, method); await refresh(); setCancelling(''); setReason(''); toast.success('Batch updated'); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(''); }
  }
  return <main className="dining"><header><p className="eyebrow">Cashier verification</p><h1>Order batches</h1><p>Approve the first batch for each table visit. Follow-up batches go directly to the kitchen and remain here as read-only records.</p><Link className="text-amber-300 underline" to={`${base}/billing`}>Table sessions & final billing</Link></header>
    <nav className="dining-tabs">{[['submitted','Needs verification'],['active','All active batches'],['history','Full history']].map(([value,label]) => <button key={value} className={filter === value ? 'active' : 'secondary'} onClick={() => setFilter(value)}>{label}{value === 'submitted' ? ` (${orders.filter(needsReview).length})` : ''}</button>)}</nav>
    {!visible.length && <section className="dining-card">No batches in this view.</section>}
    <div className="dining-grid">{visible.map(o => <article className="dining-card batch-card" key={o.id} data-batch-id={o.id}><div className="bill-line"><h2>Table {o.tableNumber} · Batch {o.batchNumber}</h2><span className={`batch-status ${o.status}`}>{statusLabel[o.status] || o.status}</span></div><p>{new Date(o.timeOrdered).toLocaleString()}</p>
      <div className="batch-items"><div className="bill-line"><strong>Item & quantity</strong><strong>Unit / line total</strong></div>{o.items.map((item,i) => <div className="bill-line" key={i}><span>{item.quantity} × {item.name}</span><span>₱{item.price.toLocaleString()} / ₱{(item.price * item.quantity).toLocaleString()}</span></div>)}</div>
      <p>Batch extras total: <strong>₱{o.totalAmount.toLocaleString()}</strong></p><p>Package is charged once on the table’s session bill.</p>{o.customerNotes && <p>Instructions: {o.customerNotes}</p>}
      {o.approvalType === 'automatic' ? <p className="success">Sent directly to kitchen · Read-only record · {new Date(o.approvedAt!).toLocaleString()}</p> : o.approvedAt && <p className="success">Verified by {o.approvedByName || 'staff'} · {new Date(o.approvedAt).toLocaleString()}</p>}
      {o.status === 'submitted' && !needsReview(o) && <p>Queued until the first batch is approved.</p>}
      {o.cancellationReason && <p>Cancellation reason: {o.cancellationReason}</p>}
      {needsReview(o) && <div className="dining-tabs"><button disabled={!!busy} onClick={() => action(o.id, `/dining/orders/${o.id}/approve`, { expectedTotal: o.totalAmount })}>Approve & send to kitchen</button><button className="secondary" disabled={!!busy} onClick={() => { setCancelling(o.id); setReason(''); }}>Cancel batch</button></div>}
      {cancelling === o.id && <form onSubmit={e => { e.preventDefault(); action(o.id, `/dining/orders/${o.id}/cancel`, { reason }); }}><label>Cancellation reason<textarea required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label><p>This releases reserved stock and excludes this batch from the bill. Approved batches cannot be cancelled.</p><button disabled={!!busy}>Confirm cancellation</button></form>}
      {activeSessions.has(o.sessionId) && o.status === 'ready' && o.approvalType !== 'automatic' && <button disabled={!!busy} onClick={() => action(o.id, `/dining/orders/${o.id}`, { status: 'served' }, 'PATCH')}>Confirm delivered & mark served</button>}
      <details><summary>Status history</summary>{o.legacyWorkflow && <p>Imported from the previous workflow; earlier staff verification was not recorded.</p>}{o.history?.map((event,i) => <p key={i}>{statusLabel[event.status] || event.status} · {event.actorName || event.actorRole} · {new Date(event.at).toLocaleString()}{event.reason ? ` · ${event.reason}` : ''}</p>)}</details>
    </article>)}</div></main>;
}
