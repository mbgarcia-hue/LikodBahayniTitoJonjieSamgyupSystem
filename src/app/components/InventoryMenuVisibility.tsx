import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useRestaurant } from '../context/RestaurantContext';
import type { InventoryItem } from '../data/restaurantData';

export default function InventoryMenuVisibility({ item }: { item: InventoryItem }) {
  const { setMenuVisibility } = useRestaurant();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const hidden = !item.hiddenFromMenu;
      if (await setMenuVisibility(item.id, hidden)) toast.success(hidden ? `${item.name} hidden from customer menus.` : `${item.name} shown on customer menus.`);
    } finally { setBusy(false); }
  }
  return <div className="mt-2">
    <button type="button" disabled={busy || item.archived} onClick={toggle} aria-label={`${item.hiddenFromMenu ? 'Show' : 'Hide'} ${item.name} ${item.hiddenFromMenu ? 'on' : 'from'} customer menu`} className="flex items-center gap-1.5 rounded border border-amber-600/40 bg-[#1A1210] px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-900/40 disabled:opacity-50">
      {item.hiddenFromMenu ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
      {busy ? 'Updating…' : item.hiddenFromMenu ? 'Show on menu' : 'Hide from menu'}
    </button>
    <p className="mt-1 text-xs text-amber-400/70">{item.archived ? 'Archived · hidden from menu' : item.hiddenFromMenu ? 'Hidden from customer menus' : 'Visible on customer menus'}</p>
  </div>;
}
