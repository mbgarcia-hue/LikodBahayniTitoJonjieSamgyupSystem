import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useRestaurant } from '../context/RestaurantContext';
import { api } from '../lib/api';
import { toast } from 'sonner';
import SessionControls, { AuditTrail } from './SessionControls';
import type { Table } from '../data/restaurantData';

function QR({ url }: { url: string }) {
  const [image, setImage] = useState('');
  useEffect(() => { let active = true; setImage(''); QRCode.toDataURL(url, { width: 360, margin: 4, errorCorrectionLevel: 'M' }).then((data: string) => { if (active) setImage(data); }).catch(() => toast.error('Could not create QR code')); return () => { active = false; }; }, [url]);
  return image ? <img className="qr-image" src={image} alt={`Scan to open ${url}`} /> : <p>Generating QR…</p>;
}
function TableCard({ table, baseUrl }: { table: Table; baseUrl: string }) {
  const tableNumber = table.id;
  const { sessions, refresh } = useRestaurant();
  const visit = sessions.find(s => s.tableNumber === tableNumber && s.status !== 'closed');
  const [regular, setRegular] = useState(1); const [discounted, setDiscounted] = useState(0);
  const [busy, setBusy] = useState(false);
  const url = `${baseUrl}/customer/${tableNumber}`;
  async function action(path: string, body: unknown, method = 'POST') {
    if (busy) return false; setBusy(true); try { await api(path, body, method); await refresh(); toast.success('Table updated'); return true; } catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(false); }
  }
  if (table.hidden) return <article className="dining-card" data-table-id={tableNumber}><h2>Table {tableNumber}</h2><p>Hidden · QR access and new visits are disabled. Previous records are retained.</p><button type="button" disabled={busy} aria-label={`Show Table ${tableNumber}`} onClick={() => action(`/dining/tables/${tableNumber}`, { hidden: false }, 'PATCH')}>Show table</button></article>;
  return <article className="dining-card" data-table-id={tableNumber}><h2>Table {tableNumber}</h2><p>{visit ? visit.status === 'open' ? 'Occupied · ordering open' : 'Bill requested' : 'Available'}</p><QR url={url} /><p className="qr-url">{url}</p><a href={url} target="_blank" rel="noreferrer">Open customer page ↗</a>
    <p><button type="button" className="secondary" disabled={busy || !!visit || table.status !== 'available'} aria-label={`Hide Table ${tableNumber}`} onClick={() => action(`/dining/tables/${tableNumber}`, { hidden: true }, 'PATCH')}>Hide table</button></p>{visit && <p className="no-print">Close this visit before hiding the table.</p>}
    <div className="staff-visit">{!visit ? <form onSubmit={e => { e.preventDefault(); action('/dining/open', { tableNumber, regularPax: regular, discountedPax: discounted }); }}><label>Regular guests · ₱220<input type="number" min={0} max={50} required value={regular} onChange={e => setRegular(Number(e.target.value))} /></label><label>Discounted guests · ₱195<input type="number" min={0} max={50} required value={discounted} onChange={e => setDiscounted(Number(e.target.value))} /></label><p>Verify guest counts and discount eligibility before opening.</p><button disabled={busy}>Open dining session</button></form>
    : <SessionControls key={visit.id} visit={visit} busy={busy} action={action} />}</div>
  </article>;
}
export default function StaffDining() {
  const { tables, refresh, transactions } = useRestaurant();
  const [error, setError] = useState('');
  const [base, setBase] = useState(() => localStorage.getItem('restaurant-qr-base') || window.location.origin);
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('restaurant-qr-base') || window.location.origin);
  const [adding, setAdding] = useState(false);
  const visibleTables = tables.filter(t => !t.hidden);
  const hiddenTables = tables.filter(t => t.hidden);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);
  function saveBase(e: React.FormEvent) { e.preventDefault(); try { const url = new URL(base); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); setBaseUrl(url.origin); localStorage.setItem('restaurant-qr-base', url.origin); toast.success('QR links updated'); } catch { toast.error('Enter a valid http or https website address'); } }
  async function addTable() {
    if (adding) return;
    setAdding(true);
    try { const table = await api('/dining/tables', {}); await refresh(); toast.success(`Table ${table.id} added with its own QR code.`); }
    catch (e) { toast.error((e as Error).message); }
    finally { setAdding(false); }
  }
  return <main className="dining">
    <header><p className="eyebrow">Service desk</p><h1>Tables, QR codes & billing</h1><p>{visibleTables.length} visible tables · {hiddenTables.length} hidden. One shared visit per group. Package charged once; payment confirmed here.</p></header>
    {error && <p className="notice error">{error}. Please sign in to your staff account.</p>}
    <form onSubmit={saveBase} className="dining-card"><label>Address customers can reach<input type="url" required value={base} onChange={e => setBase(e.target.value)} /></label><p>Use your hosted address or this computer’s LAN address, for example http://192.168.1.20:5173. Localhost QR links will not open on customer phones.</p><button>Update QR links</button> <button type="button" className="secondary" disabled={!visibleTables.length} onClick={() => window.print()}>Print {visibleTables.length} QR codes</button></form>
    <section className="dining-card"><h2>Add a restaurant table</h2><p>Each new table receives the next table number and its own permanent QR link. Hidden table numbers are kept for restoration.</p><button type="button" disabled={adding} onClick={addTable}>{adding ? 'Adding table…' : 'Add table'}</button></section>
    {!visibleTables.length && <p className="notice">No visible tables. Add a table or show one from Hidden tables.</p>}
    <div className="dining-grid qr-print">{visibleTables.map(t => <TableCard key={t.id} table={t} baseUrl={baseUrl} />)}</div>
    <details className="dining-card"><summary>Hidden tables ({hiddenTables.length})</summary><p>Hidden tables are excluded from the working floor and printed QR sheets. Show a table to enable its existing QR link again.</p><div className="dining-grid">{hiddenTables.map(t => <TableCard key={t.id} table={t} baseUrl={baseUrl} />)}</div></details>
    <section className="dining-card"><h2>Recent confirmed payments</h2>{transactions.slice(0, 10).map(t => <details key={t.id}><summary>Table {t.tableNumber} - confirmed payment - PHP {t.totalBill.toLocaleString()}</summary><p>{t.paymentMethod} - {new Date(t.timestamp).toLocaleString()}</p>{t.sessionId && <AuditTrail sessionId={t.sessionId} />}</details>)}</section>
  </main>;
}
