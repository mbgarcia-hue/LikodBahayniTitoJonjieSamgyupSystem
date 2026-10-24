import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useRestaurant } from '../context/RestaurantContext';

const initial = { name: '', category: 'Additional Items', price: '', description: '', unit: 'pcs', currentStock: '', lowStockThreshold: '5', stockPerOrder: '1', visible: true };
const fieldClass = 'mt-1 w-full rounded-lg border border-amber-600/40 bg-[#1A1210] px-3 py-2 text-amber-100 focus:outline-none focus:border-amber-400';

export default function AddProductForm() {
  const { addProduct } = useRestaurant();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const saved = await addProduct({ name: form.name, category: form.category, price: Number(form.price), description: form.description, unit: form.unit, currentStock: Number(form.currentStock), lowStockThreshold: Number(form.lowStockThreshold), stockPerOrder: Number(form.stockPerOrder), hiddenFromMenu: !form.visible });
      if (saved) { setForm(initial); setOpen(false); toast.success('Product added to inventory and menu.'); }
    } finally { setBusy(false); }
  }
  return <section className="mb-6">
    <button type="button" onClick={() => setOpen(!open)} disabled={busy} aria-expanded={open} aria-controls="add-product-form" className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 font-semibold text-[#1A1210] hover:bg-amber-500 disabled:opacity-50"><Plus className="h-4 w-4" />{open ? 'Close product form' : 'Add product'}</button>
    {open && <form id="add-product-form" onSubmit={submit} className="mt-4 rounded-xl border border-amber-600/30 bg-[#252018] p-6">
      <h2 className="text-xl font-semibold text-amber-300">New product</h2>
      <p className="mt-1 mb-4 text-sm text-amber-400/70">Add stock and its customer menu entry together. A price of zero means the product is included in the guest package.</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm text-amber-200">
        <label>Product name<input className={fieldClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={100} /></label>
        <label>Menu category<input className={fieldClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required maxLength={60} list="product-categories" /><datalist id="product-categories">{['Meat', 'Side Dishes', 'Sauces', 'Additional Items'].map(c => <option key={c} value={c} />)}</datalist></label>
        <label>Price per order (₱)<input className={fieldClass} type="number" min="0" max="1000000" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required /></label>
        <label>Stock unit<input className={fieldClass} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} required maxLength={30} list="product-units" /><datalist id="product-units">{['pcs', 'bottles', 'cans', 'kg', 'liters'].map(u => <option key={u} value={u} />)}</datalist></label>
        <label>Opening stock<input className={fieldClass} type="number" min="0" max="100000000" step="0.0001" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} required /></label>
        <label>Low stock threshold<input className={fieldClass} type="number" min="0" max="100000000" step="0.0001" value={form.lowStockThreshold} onChange={e => setForm({ ...form, lowStockThreshold: e.target.value })} required /></label>
        <label>Stock used per order<input className={fieldClass} type="number" min="0.0001" max="100000000" step="0.0001" value={form.stockPerOrder} onChange={e => setForm({ ...form, stockPerOrder: e.target.value })} required /><span className="mt-1 block text-xs text-amber-400/70">In {form.unit || 'stock units'}: use 1 for a bottle, or 0.2 for a 200 g serving when stock is in kg.</span></label>
        <label className="sm:col-span-2">Description (optional)<textarea className={fieldClass} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} maxLength={1000} /></label>
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={form.visible} onChange={e => setForm({ ...form, visible: e.target.checked })} />Show on customer menu</label>
        <div className="sm:col-span-2 lg:col-span-3"><button className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-[#1A1210] hover:bg-amber-500 disabled:opacity-50" disabled={busy}>{busy ? 'Adding product…' : 'Save product'}</button></div>
      </fieldset>
    </form>}
  </section>;
}
