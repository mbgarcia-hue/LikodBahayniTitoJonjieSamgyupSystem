import { useState } from 'react';
import { Search, Edit, Package, Archive, ArchiveRestore, AlertTriangle } from 'lucide-react';
import { useRestaurant } from '../../context/RestaurantContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
import AddProductForm from '../../components/AddProductForm';
import InventoryMenuVisibility from '../../components/InventoryMenuVisibility';
import { formatStock } from '../../lib/inventory';

type Tab = 'inventory' | 'archive';

export default function Inventory() {
  const { inventory, updateInventory, archiveInventoryItem, getLowStockItems, getOutOfStockItems } = useRestaurant();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'low' | 'out'>('all');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('inventory');

  const activeInventory   = inventory.filter((i) => !i.archived);
  const archivedInventory = inventory.filter((i) => i.archived);
  const lowStockItems     = getLowStockItems();
  const outOfStockItems   = getOutOfStockItems();

  const getStockStatus = (item: typeof inventory[0]) => {
    if (item.currentStock === 0) return 'out';
    if (item.currentStock <= item.lowStockThreshold) return 'low';
    return 'available';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-900/40 text-green-400 border border-green-600/40';
      case 'low':       return 'bg-amber-900/40 text-amber-400 border border-amber-600/40';
      case 'out':       return 'bg-red-900/40 text-red-400 border border-red-600/40';
      default:          return 'bg-amber-900/40 text-amber-400 border border-amber-600/40';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'available': return 'High Stock';
      case 'low':       return 'Low Stock';
      case 'out':       return 'Out of Stock';
      default:          return 'Unknown';
    }
  };

  const filteredInventory = activeInventory.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || getStockStatus(item) === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const filteredArchive = archivedInventory.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = async (itemId: string) => {
    const stock = Number(editValue);
    if (!editValue.trim() || !Number.isFinite(stock) || stock < 0) {
      toast.error('Enter a stock quantity of zero or more.');
      return;
    }
    setSaving(true);
    try {
      if (await updateInventory(itemId, stock)) {
        setEditingItem(null);
        toast.success('Stock saved.');
      }
    } finally { setSaving(false); }
  };

  const handleArchive = (itemId: string) => {
    archiveInventoryItem(itemId, true);
    setEditingItem(null);
  };

  const stats = {
    total:     activeInventory.length,
    available: activeInventory.filter((i) => getStockStatus(i) === 'available').length,
    low:       activeInventory.filter((i) => getStockStatus(i) === 'low').length,
    out:       activeInventory.filter((i) => getStockStatus(i) === 'out').length,
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'inventory', label: 'Inventory' },
    { key: 'archive',   label: 'Archive', count: archivedInventory.length },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Inventory Overview</h1>
        <p className="text-amber-500/60 mt-1">Shared stock saved to the database. Enter available quantities in the units shown; submitted batches have already reserved their stock.</p>
      </div>

      {/* Low-stock alert banner */}
      <AddProductForm />
      {(lowStockItems.length > 0 || outOfStockItems.length > 0) && (
        <div className="mb-6 rounded-xl border border-red-600/30 bg-red-950/25 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <p className="text-sm font-semibold text-red-300">Stock Alerts</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {outOfStockItems.map((item) => (
              <span key={item.id} className="rounded-full bg-red-900/50 border border-red-600/40 px-3 py-1 text-xs font-semibold text-red-400">
                {item.name} — Out of Stock
              </span>
            ))}
            {lowStockItems.map((item) => (
              <span key={item.id} className="rounded-full bg-amber-900/40 border border-amber-600/40 px-3 py-1 text-xs font-medium text-amber-400">
                {item.name} — {item.currentStock} {item.unit} left (min {item.lowStockThreshold})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {[
          { label: 'Total Items',   value: stats.total,     iconColor: 'text-amber-500' },
          { label: 'High Stock',    value: stats.available, iconColor: 'text-green-500' },
          { label: 'Low Stock',     value: stats.low,       iconColor: 'text-amber-500' },
          { label: 'Out of Stock',  value: stats.out,       iconColor: 'text-red-500'   },
        ].map(({ label, value, iconColor }) => (
          <div key={label} className="rounded-lg bg-[#252018] border border-amber-600/30 p-4 shadow-md">
            <div className="flex items-center gap-3">
              <Package className={`h-8 w-8 ${iconColor}`} />
              <div>
                <p className="text-2xl font-bold text-amber-200">{value}</p>
                <p className={`text-sm ${iconColor}`}>{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-amber-600/20">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSearchTerm(''); setEditingItem(null); }}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-amber-500 text-amber-300'
                : 'border-transparent text-amber-500/50 hover:text-amber-400'
            }`}
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === key ? 'bg-amber-700/50 text-amber-300' : 'bg-amber-900/40 text-amber-500/60'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="mb-5 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-600/50" />
          <input
            type="text"
            placeholder={tab === 'archive' ? 'Search archived items…' : 'Search inventory items…'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-amber-600/40 bg-[#252018] py-2.5 pl-10 pr-4 text-amber-100 placeholder-amber-700/50 focus:border-amber-500 focus:outline-none"
          />
        </div>
        {tab === 'inventory' && (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="rounded-lg border border-amber-600/40 bg-[#252018] px-4 py-2.5 text-amber-100 focus:border-amber-500 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="available">High Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        )}
      </div>

      {/* ── Inventory Tab ── */}
      {tab === 'inventory' && (
        <div className="rounded-xl bg-[#252018] border border-amber-600/30 shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1A1210] border-b border-amber-600/30">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Item Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Current Stock</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Unit</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Low Threshold</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Last Updated</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-600/20">
                {filteredInventory.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-amber-500/40 text-sm">No items match your search</td></tr>
                )}
                {filteredInventory.map((item) => {
                  const status = getStockStatus(item);
                  return (
                    <tr key={item.id} className="hover:bg-amber-600/10 transition-colors">
                      <td className="px-6 py-4 font-medium text-amber-200">{item.name}</td>
                      <td className="px-6 py-4">
                        {editingItem === item.id ? (
                          <input
                            type="number"
                            aria-label={`Available stock for ${item.name}`}
                            min="0"
                            step="any"
                            disabled={saving}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-24 rounded border border-amber-600/50 bg-[#1A1210] px-2 py-1 text-amber-100 focus:border-amber-500 focus:outline-none"
                          />
                        ) : (
                          <span className={`font-semibold ${status === 'out' ? 'text-red-400' : status === 'low' ? 'text-amber-400' : 'text-amber-200'}`}>
                            {formatStock(item.currentStock, item.unit)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-amber-400/70">{item.unit}</td>
                      <td className="px-6 py-4 text-amber-400/60">{item.lowStockThreshold}</td>
                      <td className="px-6 py-4 text-sm text-amber-400/60">{format(new Date(item.lastUpdated), 'MMM d, h:mm a')}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${getStatusBadge(status)}`}>
                          {getStatusText(status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {editingItem === item.id ? (
                          <div className="flex gap-2 flex-wrap">
                            <button disabled={saving} onClick={() => handleSave(item.id)} className="rounded bg-green-700 px-3 py-1 text-xs font-medium text-white hover:bg-green-600 transition-colors">{saving ? 'Saving…' : 'Save'}</button>
                            <button onClick={() => handleArchive(item.id)} className="flex items-center gap-1 rounded bg-[#1A1210] border border-amber-600/30 px-3 py-1 text-xs font-medium text-amber-400/70 hover:text-amber-300 transition-colors">
                              <Archive className="h-3 w-3" /> Archive
                            </button>
                            <button onClick={() => setEditingItem(null)} className="rounded bg-amber-800/60 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-700/60 transition-colors">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingItem(item.id); setEditValue(item.currentStock.toString()); }}
                            className="flex items-center gap-1 rounded bg-gradient-to-r from-amber-600 to-amber-700 px-3 py-1 text-xs font-medium text-white hover:from-amber-500 hover:to-amber-600 transition-colors shadow-sm"
                          >
                            <Edit className="h-3 w-3" /> Edit
                          </button>
                        )}
                        <InventoryMenuVisibility item={item} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Archive Tab ── */}
      {tab === 'archive' && (
        <div className="rounded-xl bg-[#252018] border border-amber-600/20 shadow-md overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-3.5 border-b border-amber-600/20 bg-amber-900/10">
            <Archive className="h-4 w-4 text-amber-500/60" />
            <p className="text-sm font-semibold text-amber-400/70">Archived Items</p>
            <span className="text-xs text-amber-600/40">— hidden from active inventory</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1A1210] border-b border-amber-600/30">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Item Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Stock</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Unit</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Low Threshold</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Last Updated</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Archived At</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-600/20">
                {filteredArchive.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-amber-500/40 text-sm">No archived items</td></tr>
                )}
                {filteredArchive.map((item) => (
                  <tr key={item.id} className="opacity-70 hover:opacity-100 transition-opacity">
                    <td className="px-6 py-4 font-medium text-amber-200">{item.name}</td>
                    <td className="px-6 py-4 font-semibold text-amber-200">{item.currentStock}</td>
                    <td className="px-6 py-4 text-amber-400/70">{item.unit}</td>
                    <td className="px-6 py-4 text-amber-400/60">{item.lowStockThreshold}</td>
                    <td className="px-6 py-4 text-sm text-amber-400/60">{format(new Date(item.lastUpdated), 'MMM d, h:mm a')}</td>
                    <td className="px-6 py-4 text-sm text-amber-500/50">
                      {item.archivedAt ? format(new Date(item.archivedAt), 'MMM d, yyyy · h:mm a') : <span className="text-amber-600/30 italic">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => archiveInventoryItem(item.id, false)}
                        className="flex items-center gap-1.5 rounded bg-amber-800/50 border border-amber-600/40 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-700/60 transition-colors"
                      >
                        <ArchiveRestore className="h-3 w-3" /> Restore
                      </button>
                      <InventoryMenuVisibility item={item} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
