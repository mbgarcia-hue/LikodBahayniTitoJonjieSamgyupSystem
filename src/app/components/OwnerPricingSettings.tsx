import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useRestaurant, type GuestPricing } from '../context/RestaurantContext';
import type { MenuItem } from '../data/restaurantData';

const maximumPrice = 1000000;
const fieldClass = 'w-28 rounded border border-amber-600/40 bg-[#1A1210] px-2 py-2 text-amber-100 focus:border-amber-500 focus:outline-none';

function MenuPriceRow({ item, onSave }: { item: MenuItem; onSave: (id: string, values: { price: number; priceMinimum: number; priceMaximum: number }) => Promise<boolean> }) {
  const [price, setPrice] = useState(String(item.price));
  const [minimum, setMinimum] = useState(String(item.priceMinimum ?? 0));
  const [maximum, setMaximum] = useState(String(item.priceMaximum ?? maximumPrice));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPrice(String(item.price));
    setMinimum(String(item.priceMinimum ?? 0));
    setMaximum(String(item.priceMaximum ?? maximumPrice));
  }, [item.price, item.priceMinimum, item.priceMaximum, item.priceUpdatedAt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const values = { price: Number(price), priceMinimum: Number(minimum), priceMaximum: Number(maximum) };
    if ([price, minimum, maximum].some(value => !value.trim()) || Object.values(values).some(value => !Number.isFinite(value)) || values.priceMinimum > values.priceMaximum || values.price < values.priceMinimum || values.price > values.priceMaximum) {
      toast.error('Set a valid price within the minimum and maximum.');
      return;
    }
    setSaving(true);
    try {
      if (await onSave(item.id, values)) toast.success(`${item.name} pricing saved.`);
    } finally {
      setSaving(false);
    }
  }

  return <tr className="border-t border-amber-600/20">
    <td className="px-4 py-3 font-medium text-amber-200">{item.name}</td>
    <td className="px-4 py-3"><input aria-label={`Price for ${item.name}`} className={fieldClass} type="number" min={minimum} max={maximum} step="0.01" required value={price} onChange={event => setPrice(event.target.value)} /></td>
    <td className="px-4 py-3"><input aria-label={`Minimum price for ${item.name}`} className={fieldClass} type="number" min="0" max={maximumPrice} step="0.01" required value={minimum} onChange={event => setMinimum(event.target.value)} /></td>
    <td className="px-4 py-3"><input aria-label={`Maximum price for ${item.name}`} className={fieldClass} type="number" min={minimum} max={maximumPrice} step="0.01" required value={maximum} onChange={event => setMaximum(event.target.value)} /></td>
    <td className="px-4 py-3"><button type="button" disabled={saving} onClick={submit} className="rounded bg-amber-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save price'}</button></td>
  </tr>;
}

export default function OwnerPricingSettings() {
  const { menu, pricing, updateGuestPricing, updateMenuPricing } = useRestaurant();
  const [regular, setRegular] = useState(String(pricing.regularGuestPrice));
  const [discounted, setDiscounted] = useState(String(pricing.discountedGuestPrice));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRegular(String(pricing.regularGuestPrice));
    setDiscounted(String(pricing.discountedGuestPrice));
  }, [pricing.regularGuestPrice, pricing.discountedGuestPrice]);

  async function saveGuestPricing(event: FormEvent) {
    event.preventDefault();
    const values: GuestPricing = { regularGuestPrice: Number(regular), discountedGuestPrice: Number(discounted) };
    if ([regular, discounted].some(value => !value.trim()) || Object.values(values).some(value => !Number.isFinite(value) || value < 0 || value > maximumPrice || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) || values.discountedGuestPrice > values.regularGuestPrice) {
      toast.error('Enter valid package prices; discounted pricing cannot exceed regular pricing.');
      return;
    }
    setSaving(true);
    try {
      if (await updateGuestPricing(values)) toast.success('Guest package prices saved for new visits.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="mb-6 space-y-5 rounded-xl border border-amber-600/30 bg-[#252018] p-5 shadow-md">
    <div><h2 className="text-xl font-semibold text-amber-300">Owner pricing controls</h2><p className="mt-1 text-sm text-amber-500/60">Package price changes apply to new visits. Menu price limits are enforced by the server.</p></div>
    <form onSubmit={saveGuestPricing} className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm text-amber-200">Regular guest package · ₱<input aria-label="Regular guest package price" className={fieldClass} type="number" min="0" max={maximumPrice} step="0.01" required value={regular} onChange={event => setRegular(event.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm text-amber-200">Discounted guest package · ₱<input aria-label="Discounted guest package price" className={fieldClass} type="number" min="0" max={maximumPrice} step="0.01" required value={discounted} onChange={event => setDiscounted(event.target.value)} /></label>
      <button disabled={saving} className="rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save package prices'}</button>
    </form>
    <details>
      <summary className="cursor-pointer py-2 font-semibold text-amber-300">Menu item prices and limits ({menu.length})</summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-amber-400/80"><tr><th className="px-4 py-3">Menu item</th><th className="px-4 py-3">Price ₱</th><th className="px-4 py-3">Minimum ₱</th><th className="px-4 py-3">Maximum ₱</th><th className="px-4 py-3">Action</th></tr></thead>
          <tbody>{menu.map(item => <MenuPriceRow key={item.id} item={item} onSave={updateMenuPricing} />)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
