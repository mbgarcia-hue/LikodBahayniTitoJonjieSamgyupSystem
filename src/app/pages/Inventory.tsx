import { useState } from 'react';
import { Search, Edit, Package, Archive, ArchiveRestore, TrendingDown, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import { useRestaurant } from '../context/RestaurantContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
import AddProductForm from '../components/AddProductForm';
import InventoryMenuVisibility from '../components/InventoryMenuVisibility';
import InventoryImageEditor from '../components/InventoryImageEditor';
import OwnerPricingSettings from '../components/OwnerPricingSettings';
import { formatStock } from '../lib/inventory';

type Tab = 'inventory' | 'archive' | 'log';

export default function Inventory({ canManage = false, canManagePricing = false }: { canManage?: boolean; canManagePricing?: boolean }) {
  const { inventory, inventoryMovements, updateInventory, restockInventory, archiveInventoryItem, getLowStockItems, getOutOfStockItems } = useRestaurant();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'low' | 'out'>('all');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [restockingItem, setRestockingItem] = useState<string | null>(null);
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockReason, setRestockReason] = useState('');
  const [restocking, setRestocking] = useState(false);
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

  const filteredLog = inventoryMovements.filter((m) =>
    m.itemName.toLowerCase().includes(searchTerm.toLowerCase())
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

  const handleRestock = async (itemId: string) => {
    const quantity = Number(restockQuantity);
    if (!restockQuantity.trim() || !Number.isFinite(quantity) || quantity <= 0 || !restockReason.trim()) {
      toast.error('Enter a restock quantity greater than zero and a reason.');
      return;
    }
    setRestocking(true);
    try {
      if (await restockInventory(itemId, quantity, restockReason.trim())) {
        setRestockingItem(null);
        setRestockQuantity('');
        setRestockReason('');
        toast.success('Stock restocked and recorded in the movement log.');
      }
    } finally { setRestocking(false); }
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
    { key: 'log',       label: 'Movement Log', count: inventoryMovements.length },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Inventory Overview</h1>
        <p className="text-amber-500/60 mt-1">{canManage ? 'Shared stock and movement history saved to the database. Enter available quantities in the units shown; submitted batches have already reserved their stock.' : 'View shared stock levels and movement history. Submitted batches have already reserved their stock.'}</p>
      </div>

      {/* Low-stock alert banner */}
      {canManagePricing && <OwnerPricingSettings />}
      {canManage && <AddProductForm />}
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
            placeholder={tab === 'log' ? 'Search movement log…' : tab === 'archive' ? 'Search archived items…' : 'Search inventory items…'}
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
                  <th className="px-4 py-4 text-left text-sm font-semibold text-amber-400/80">Photo</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Item Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Current Stock</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Unit</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Low Threshold</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Last Updated</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Status</th>
                  {canManage && <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-600/20">
                {filteredInventory.length === 0 && (
                  <tr><td colSpan={canManage ? 8 : 7} className="px-6 py-10 text-center text-amber-500/40 text-sm">No items match your search</td></tr>
                )}
                {filteredInventory.map((item) => {
                  const status = getStockStatus(item);
                  return (
                    <tr key={item.id} className="hover:bg-amber-600/10 transition-colors">
                      <td className="px-4 py-3"><InventoryImageEditor item={item} /></td>
                      <td className="px-6 py-4 font-medium text-amber-200">{item.name}</td>
                      <td className="px-6 py-4">
                        {canManage && editingItem === item.id ? (
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
                          <div>
                            <span className={`font-semibold ${status === 'out' ? 'text-red-400' : status === 'low' ? 'text-amber-400' : 'text-amber-200'}`}>
                              {formatStock(item.currentStock, item.unit)}
                            </span>
                            <details className="mt-1 text-xs text-amber-500/60">
                              <summary className="cursor-pointer hover:text-amber-300">FIFO lots ({item.stockLots?.length || 0})</summary>
                              <div className="mt-2 min-w-56 space-y-2">
                                {item.stockLots?.length ? item.stockLots.map(lot => (
                                  <div key={lot.id} className="border-l border-amber-700/50 pl-2">
                                    <p className="text-amber-300">{formatStock(lot.remainingQuantity, item.unit)} remaining · {lot.source}</p>
                                    <p>Received {format(new Date(lot.receivedAt), 'MMM d, yyyy h:mm a')}</p>
                                    <p>{lot.reason}{lot.actorName ? ` · ${lot.actorName}` : ''}</p>
                                  </div>
                                )) : <p>No stock lots recorded.</p>}
                              </div>
                            </details>
                          </div>
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
                      {canManage && <td className="px-6 py-4">
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
                        {editingItem !== item.id && (
                          <button
                            type="button"
                            onClick={() => { setRestockingItem(restockingItem === item.id ? null : item.id); setRestockQuantity(''); setRestockReason(''); }}
                            className="mt-2 flex items-center gap-1 rounded border border-green-700/50 bg-green-950/30 px-3 py-1 text-xs font-medium text-green-300 hover:bg-green-900/40"
                          >
                            <TrendingUp className="h-3 w-3" /> Restock
                          </button>
                        )}
                        {restockingItem === item.id && (
                          <div className="mt-2 min-w-48 space-y-2 rounded border border-green-700/40 bg-[#1A1210] p-2">
                            <label className="block text-xs text-amber-300">
                              Quantity ({item.unit})
                              <input aria-label={`Restock quantity for ${item.name}`} type="number" min="0.0001" max="100000000" step="0.0001" value={restockQuantity} onChange={event => setRestockQuantity(event.target.value)} disabled={restocking} className="mt-1 w-full rounded border border-amber-600/40 bg-[#252018] px-2 py-1 text-amber-100" />
                            </label>
                            <label className="block text-xs text-amber-300">
                              Reason
                              <input aria-label={`Restock reason for ${item.name}`} type="text" maxLength={300} value={restockReason} onChange={event => setRestockReason(event.target.value)} disabled={restocking} className="mt-1 w-full rounded border border-amber-600/40 bg-[#252018] px-2 py-1 text-amber-100" />
                            </label>
                            <div className="flex gap-2">
                              <button type="button" disabled={restocking} onClick={() => handleRestock(item.id)} className="rounded bg-green-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">{restocking ? 'Saving…' : 'Save restock'}</button>
                              <button type="button" disabled={restocking} onClick={() => setRestockingItem(null)} className="rounded border border-amber-600/30 px-2 py-1 text-xs text-amber-300">Cancel</button>
                            </div>
                          </div>
                        )}
                        <InventoryMenuVisibility item={item} />
                      </td>}
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
                  <th className="px-4 py-4 text-left text-sm font-semibold text-amber-400/80">Photo</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Item Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Stock</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Unit</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Low Threshold</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Last Updated</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Archived At</th>
                  {canManage && <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-600/20">
                {filteredArchive.length === 0 && (
                  <tr><td colSpan={canManage ? 8 : 7} className="px-6 py-10 text-center text-amber-500/40 text-sm">No archived items</td></tr>
                )}
                {filteredArchive.map((item) => (
                  <tr key={item.id} className="opacity-70 hover:opacity-100 transition-opacity">
                    <td className="px-4 py-3"><InventoryImageEditor item={item} /></td>
                    <td className="px-6 py-4 font-medium text-amber-200">{item.name}</td>
                    <td className="px-6 py-4 font-semibold text-amber-200">{item.currentStock}</td>
                    <td className="px-6 py-4 text-amber-400/70">{item.unit}</td>
                    <td className="px-6 py-4 text-amber-400/60">{item.lowStockThreshold}</td>
                    <td className="px-6 py-4 text-sm text-amber-400/60">{format(new Date(item.lastUpdated), 'MMM d, h:mm a')}</td>
                    <td className="px-6 py-4 text-sm text-amber-500/50">
                      {item.archivedAt ? format(new Date(item.archivedAt), 'MMM d, yyyy · h:mm a') : <span className="text-amber-600/30 italic">—</span>}
                    </td>
                    {canManage && <td className="px-6 py-4">
                      <button
                        onClick={() => archiveInventoryItem(item.id, false)}
                        className="flex items-center gap-1.5 rounded bg-amber-800/50 border border-amber-600/40 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-700/60 transition-colors"
                      >
                        <ArchiveRestore className="h-3 w-3" /> Restore
                      </button>
                      <InventoryMenuVisibility item={item} />
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Movement Log Tab ── */}
      {tab === 'log' && (
        <div className="rounded-xl bg-[#252018] border border-amber-600/30 shadow-md overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-3.5 border-b border-amber-600/20">
            <Clock className="h-4 w-4 text-amber-500/60" />
            <p className="text-sm font-semibold text-amber-400/70">Inventory Movement Log</p>
            <span className="text-xs text-amber-600/40">— stock reservations, adjustments and restocks</span>
          </div>
          {filteredLog.length === 0 ? (
            <div className="px-6 py-12 text-center text-amber-500/40 text-sm">
              No movements recorded yet. Stock changes appear when products are added, batches are submitted or cancelled, and stock is adjusted.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#1A1210] border-b border-amber-600/30">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-amber-400/70">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-amber-400/70">Item</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-amber-400/70">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-amber-400/70">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-amber-400/70">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-amber-400/70">FIFO lot(s)</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-amber-400/70">Stock after</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-amber-400/70">Recorded by</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-amber-400/70">Table</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-600/15">
                  {filteredLog.map((mov) => (
                    <tr key={mov.id} className="hover:bg-amber-600/8 transition-colors">
                      <td className="px-6 py-3 text-xs text-amber-500/50 whitespace-nowrap">
                        {format(new Date(mov.timestamp), 'MMM d, h:mm:ss a')}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-amber-200">{mov.itemName}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          mov.type === 'deduction'
                            ? 'bg-red-900/30 text-red-400 border-red-600/35'
                            : 'bg-green-900/30 text-green-400 border-green-600/35'
                        }`}>
                          {mov.type === 'deduction'
                            ? <TrendingDown className="h-3 w-3" />
                            : <TrendingUp className="h-3 w-3" />}
                          {mov.type === 'deduction' ? 'Deduction' : 'Restock'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm font-mono">
                        <span className={mov.type === 'deduction' ? 'text-red-400' : 'text-green-400'}>
                          {mov.type === 'deduction' ? '-' : '+'}{formatStock(mov.quantity, mov.unit)} {mov.unit}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-amber-500/60 max-w-xs truncate">{mov.reason}</td>
                      <td className="px-6 py-3 text-xs text-amber-400/70">
                        {mov.lots?.length ? mov.lots.map((lot, index) => (
                          <span key={`${lot.lotId}-${index}`} className="block">
                            {formatStock(lot.quantity, mov.unit)} · {lot.receivedAt ? format(new Date(lot.receivedAt), 'MMM d, yyyy') : lot.lotId}
                          </span>
                        )) : mov.lotReceivedAt ? format(new Date(mov.lotReceivedAt), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-amber-200">{mov.afterStock === undefined ? '—' : formatStock(mov.afterStock, mov.unit)}</td>
                      <td className="px-6 py-3 text-sm text-amber-400/70">{mov.actorName || 'System'}</td>
                      <td className="px-6 py-3 text-sm text-amber-400/70">
                        {mov.tableNumber ? `Table ${mov.tableNumber}` : <span className="text-amber-600/30">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
