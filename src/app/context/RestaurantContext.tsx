import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { Order, InventoryItem, Table, Transaction, InventoryMovement } from '../data/restaurantData';

export interface DiningSession { id: string; tableNumber: number; regularPax: number; discountedPax: number; packageTotal: number; code: string; status: string; initialBatchApproved: boolean; additionalTotal: number; grossTotal: number; discountAmount: number; discountReason: string; total: number; canClose: boolean; blockers: {id: string; batchNumber: number; status: string}[]; }
export interface NewProduct { name: string; category: string; price: number; description: string; unit: string; currentStock: number; lowStockThreshold: number; stockPerOrder: number; hiddenFromMenu: boolean; }
interface State { orders: (Order & {sessionId: string})[]; inventory: InventoryItem[]; tables: Table[]; transactions: Transaction[]; inventoryMovements: InventoryMovement[]; sessions: DiningSession[]; }
const empty: State = { orders: [], inventory: [], tables: [], transactions: [], inventoryMovements: [], sessions: [] };
function useStore() {
  const [state, setState] = useState<State>(empty);
  const refresh = useCallback(async () => { try { const next = await api('/dining/state'); setState(next); } catch (e) { setState(empty); throw e; } }, []);
  useEffect(() => {
    let mounted = true;
    const poll = async () => { if (!/^\/(cashier|kitchen|owner|admin)(\/|$)/.test(window.location.pathname) || /\/(login|register)$/.test(window.location.pathname)) { if (mounted) setState(empty); return; } try { const next = await api('/dining/state'); if (mounted) setState(next); } catch { if (mounted) setState(empty); } };
    poll(); const timer = setInterval(poll, 3000); return () => { mounted = false; clearInterval(timer); };
  }, []);
  const change = async (path: string, body: unknown) => { try { await api(path, body, 'PATCH'); await refresh(); return true; } catch (e) { toast.error((e as Error).message); return false; } };
  return { ...state, refresh,
    addProduct: async (product: NewProduct) => { try { await api('/dining/inventory', product); await refresh(); return true; } catch (e) { toast.error((e as Error).message); return false; } },
    updateOrderStatus: (id: string, status: Order['status']) => change(`/dining/orders/${id}`, { status }),
    updateInventory: (id: string, currentStock: number) => change(`/dining/inventory/${id}`, { currentStock }),
    archiveInventoryItem: (id: string, archived: boolean) => change(`/dining/inventory/${id}`, { archived }),
    setMenuVisibility: (id: string, hiddenFromMenu: boolean) => change(`/dining/inventory/${id}`, { hiddenFromMenu }),
    getLowStockItems: () => state.inventory.filter(i => !i.archived && i.currentStock > 0 && i.currentStock <= i.lowStockThreshold),
    getOutOfStockItems: () => state.inventory.filter(i => !i.archived && i.currentStock <= 0),
  };
}
const Context = createContext<ReturnType<typeof useStore> | null>(null);
export function RestaurantProvider({ children }: { children: ReactNode }) { const value = useStore(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useRestaurant() { const context = useContext(Context); if (!context) throw new Error('Restaurant provider is missing'); return context; }
