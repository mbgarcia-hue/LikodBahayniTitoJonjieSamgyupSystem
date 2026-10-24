import { newRequestId } from '../../lib/id';
import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import type { MenuItem, Order } from '../../data/restaurantData';
import { statusLabel } from '../../lib/orderStatus';

type Access = { id: string; token: string };
type Visit = { session: { id: string; tableNumber: number; status: string; regularPax: number; discountedPax: number; packageTotal: number; initialBatchApproved: boolean }; orders: Order[]; total: number; additionalTotal: number; discountAmount: number; discountReason: string; blockers: {id: string; batchNumber: number; status: string}[]; menu: MenuItem[] };
function saved<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
const money = (n: number) => `₱${n.toLocaleString()}`;
export default function TableVisit() {
  const { tableId } = useParams(); const location = useLocation(); const navigate = useNavigate();
  const tableNumber = Number(tableId); const key = `visit-${tableId}`;
  const [access, setAccess] = useState<Access | null>(() => saved(key, null));
  const [visit, setVisit] = useState<Visit | null>(null);
  const [code, setCode] = useState(''); const [error, setError] = useState(''); const [connectionError, setConnectionError] = useState(''); const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({}); const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('All');
  const [tableCheck, setTableCheck] = useState({ status: 'loading', message: '' });
  const [tableRetry, setTableRetry] = useState(0);
  const requestId = useRef('');
  const hydratedDraft = useRef('');
  const stage = location.pathname.endsWith('/bill') ? 'bill' : location.pathname.endsWith('/cart') ? 'cart' : 'menu';
  useEffect(() => { setAccess(saved(key, null)); setVisit(null); setCart({}); setNotes(''); }, [key]);
  useEffect(() => {
    if (!Number.isSafeInteger(tableNumber) || tableNumber < 1) return;
    if (access) { setTableCheck({ status: 'ready', message: '' }); return; }
    let active = true;
    setTableCheck({ status: 'loading', message: '' });
    api(`/dining/tables/${tableNumber}`).then(() => {
      if (active) setTableCheck({ status: 'ready', message: '' });
    }).catch(e => {
      if (active) setTableCheck({ status: e.status === 404 ? 'unavailable' : 'error', message: e.message });
    });
    return () => { active = false; };
  }, [tableNumber, access?.id, tableRetry]);
  useEffect(() => {
    if (!access) return;
    const draft = saved<{cart: Record<string, number>; notes: string; requestId: string}>(`draft-${access.id}`, { cart: {}, notes: '', requestId: newRequestId() });
    setCart(draft.cart); setNotes(draft.notes); requestId.current = draft.requestId;
    hydratedDraft.current = '';
  }, [access?.id]);
  useEffect(() => {
    if (!access || !requestId.current) return;
    if (hydratedDraft.current !== access.id) { hydratedDraft.current = access.id; return; }
    localStorage.setItem(`draft-${access.id}`, JSON.stringify({ cart, notes, requestId: requestId.current }));
  }, [cart, notes, access]);
  useEffect(() => {
    if (!access) return; let active = true;
    const refresh = async () => { try { const data = await api(`/dining/visits/${access.id}`, undefined, 'GET', access.token); if (active) { setVisit(data); setConnectionError(''); } } catch (e) { if (active) setConnectionError((e as Error).message); } };
    refresh(); const timer = setInterval(refresh, 3000); return () => { active = false; clearInterval(timer); };
  }, [access]);
  useEffect(() => {
    if (visit && category !== 'All' && !visit.menu.some(m => m.category === category)) setCategory('All');
  }, [visit?.menu, category]);
  useEffect(() => {
    if (!visit || busy) return;
    const visible = new Set(visit.menu.map(m => m.id));
    if (Object.entries(cart).some(([id, quantity]) => quantity > 0 && !visible.has(id))) {
      setCart(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => visible.has(id))));
      requestId.current = newRequestId();
      setError('Some items were removed from your draft because they are no longer on the menu. Please review your cart.');
    }
  }, [visit?.menu, cart, busy]);
  async function join(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const next = await api('/dining/join', { tableNumber, code }); localStorage.setItem(key, JSON.stringify(next)); setAccess(next); navigate(`/customer/${tableId}/menu`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function edit(id: string, delta: number) { if (busy) return; requestId.current = newRequestId(); setCart(prev => ({ ...prev, [id]: Math.max(0, Math.min(100, (prev[id] || 0) + delta)) })); }
  async function submit() {
    if (!access || busy) return; setBusy(true); setError('');
    try {
      await api(`/dining/visits/${access.id}/orders`, { requestId: requestId.current, items: Object.entries(cart).filter(([, q]) => q > 0).map(([menuItemId, quantity]) => ({ menuItemId, quantity })), notes }, 'POST', access.token);
      setCart({}); setNotes(''); requestId.current = newRequestId(); localStorage.removeItem(`draft-${access.id}`);
      setVisit(await api(`/dining/visits/${access.id}`, undefined, 'GET', access.token)); navigate(`/customer/${tableId}/bill`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function bill() {
    if (Object.values(cart).some(q => q > 0)) { setError('Submit your draft batch or remove its items before finishing ordering.'); return; }
    if (!access) return; setBusy(true); setError('');
    try { setVisit(await api(`/dining/visits/${access.id}/request-bill`, {}, 'POST', access.token)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  if (!Number.isSafeInteger(tableNumber) || tableNumber < 1) return <main className="dining"><h1>Table not found</h1><p>Please scan a valid restaurant table QR code.</p></main>;
  const selected = visit?.menu.filter(m => cart[m.id] > 0) || [];
  const cartTotal = selected.reduce((n, m) => n + m.price * cart[m.id], 0);
  const activeCategory = visit?.menu.some(m => m.category === category) ? category : 'All';
  return <main className="dining customer-dining">
    <header><p className="eyebrow">Likod Bahay ni Tito Jonjie</p><h1>Table {tableNumber}</h1><p>Unlimited samgyupsal · Order together, enjoy together</p></header>
    {error && <p className="notice error" role="alert">{error}</p>}
    {connectionError && <p className="notice error" role="alert">{connectionError}</p>}
    {!access && tableCheck.status !== 'ready' ? <section className="dining-card"><h2>{tableCheck.status === 'loading' ? 'Checking your table…' : tableCheck.status === 'unavailable' ? 'Table unavailable' : 'Unable to check this table'}</h2><p role="status">{tableCheck.status === 'loading' ? 'Please wait while we check your QR link.' : tableCheck.message}</p>{tableCheck.status !== 'loading' && <button onClick={() => setTableRetry(n => n + 1)}>Try again</button>}</section>
    : !access ? <form onSubmit={join} className="dining-card"><h2>Join your table</h2><p>Ask your server for this visit’s six-digit code. Everyone at your table can join the same visit.</p><label>Visit code<input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="off" /></label><button disabled={busy}>{busy ? 'Joining…' : 'Open menu'}</button></form>
    : !visit ? <section className="dining-card"><p>Loading your table…</p><button onClick={() => { localStorage.removeItem(key); setAccess(null); }}>Enter visit code again</button></section>
    : visit.session.status === 'closed' ? <section className="dining-card"><h2>Thank you for dining with us</h2><p>This visit is paid and closed. Total: {money(visit.total)}</p><button onClick={() => { localStorage.removeItem(key); localStorage.removeItem(`draft-${access.id}`); setAccess(null); setVisit(null); }}>Join a new visit</button></section>
    : <>
      <nav className="dining-tabs">{['menu', 'cart', 'bill'].map(s => <button key={s} className={stage === s ? 'active' : 'secondary'} onClick={() => navigate(`/customer/${tableId}/${s}`)}>{s === 'menu' ? 'Menu' : s === 'cart' ? `Your cart (${Object.values(cart).reduce((n, q) => n + q, 0)})` : 'Table orders & bill'}</button>)}</nav>
      <p className="notice">{visit.session.regularPax + visit.session.discountedPax} guests · Package {money(visit.session.packageTotal)} charged once per visit. Your draft cart is private; submitted orders are shared.</p>
      <p className="notice">{visit.session.initialBatchApproved ? 'Your first batch is approved. New batches go directly to the kitchen.' : 'The cashier approves your table’s first batch. Additional batches wait for that approval, then go directly to the kitchen.'}</p>
      {visit.session.status !== 'open' && <p className="notice">Bill requested. Ordering is paused. Please pay the cashier or ask staff to reopen ordering.</p>}
      {stage === 'menu' && <><p>Add items to your batch, then adjust quantities and submit from Your cart.</p><div className="dining-tabs">{['All', ...new Set(visit.menu.map(m => m.category))].map(c => <button className="secondary" key={c} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="dining-grid">{visit.menu.filter(m => activeCategory === 'All' || m.category === activeCategory).map(m => <article className="dining-card" key={m.id}><span className="eyebrow">{m.category}</span><h2>{m.name}</h2><p>{m.description}</p><strong>{m.price ? money(m.price) : 'Included in package'}</strong><div className="quantity"><button aria-label={`Add ${m.name} to batch`} disabled={busy || !m.available || visit.session.status !== 'open' || (cart[m.id] || 0) >= 100} onClick={() => edit(m.id, 1)}>Add to Batch</button></div>{cart[m.id] > 0 && <p role="status">In your cart: {cart[m.id]}</p>}{!m.available && <p className="error">Currently unavailable</p>}</article>)}</div></>}
      {stage === 'cart' && <section className="dining-card"><h2>Review your batch</h2>{!selected.length && <p>Your cart is empty. Choose items from the menu.</p>}{selected.map(m => <div className="bill-line" key={m.id}><span>{m.name} × {cart[m.id]}</span><span>{money(m.price * cart[m.id])}</span><button aria-label={`Decrease ${m.name} in cart`} disabled={busy} onClick={() => edit(m.id, -1)}>−</button><button aria-label={`Increase ${m.name} in cart`} disabled={busy || !m.available || visit.session.status !== 'open' || cart[m.id] >= 100} onClick={() => edit(m.id, 1)}>+</button><button className="secondary" aria-label={`Remove ${m.name} from cart`} disabled={busy} onClick={() => edit(m.id, -cart[m.id])}>Remove</button></div>)}<label>Special instructions<textarea maxLength={1000} value={notes} onChange={e => { requestId.current = newRequestId(); setNotes(e.target.value); }} disabled={busy} /></label><p>Additional charges for this batch: <strong>{money(cartTotal)}</strong></p><p>The package is already on your table’s bill.</p><button onClick={submit} disabled={busy || !selected.length || visit.session.status !== 'open'}>{busy ? 'Sending…' : 'Submit batch'}</button></section>}
      {stage === 'bill' && <><section className="dining-card"><h2>Your table’s bill</h2><div className="bill-line"><span>Regular guests × {visit.session.regularPax}</span><strong>{money(visit.session.regularPax * 220)}</strong></div><div className="bill-line"><span>Discounted guests × {visit.session.discountedPax}</span><strong>{money(visit.session.discountedPax * 195)}</strong></div><div className="bill-line"><span>Additional items</span><strong>{money(visit.additionalTotal)}</strong></div><div className="bill-line"><span>Additional discount: {visit.discountReason || 'None'}</span><strong>{money(visit.discountAmount)}</strong></div><div className="bill-line"><h2>Total</h2><h2>{money(visit.total)}</h2></div><button disabled={busy || visit.session.status !== 'open'} onClick={bill}>Finish ordering & request bill</button><p>Payment is confirmed by the cashier after every batch is served. Cancelled batches are excluded from your total.</p>{visit.session.status !== 'open' && visit.blockers.length > 0 && <p className="notice">Waiting for {visit.blockers.length} batch(es) to finish service.</p>}</section><h2>Shared order history</h2>{!visit.orders.length && <p>No orders yet.</p>}{visit.orders.map((o, i) => <article className="dining-card" key={o.id}><div className="bill-line"><h2>Batch {o.batchNumber || i + 1}</h2><strong>{statusLabel[o.status] || o.status}</strong></div><p>{new Date(o.timeOrdered).toLocaleTimeString()}</p>{o.items.map((item, j) => <p key={j}>{item.quantity} × {item.name} — {money(item.price * item.quantity)}</p>)}{o.customerNotes && <p>Instructions: {o.customerNotes}</p>}{o.cancellationReason && <p>Cancelled: {o.cancellationReason}</p>}<details><summary>Batch status history</summary>{o.history?.map((event, n) => <p key={n}>{statusLabel[event.status] || event.status} - {new Date(event.at).toLocaleTimeString()}</p>)}</details></article>)}</>}
    </>}
  </main>;
}
