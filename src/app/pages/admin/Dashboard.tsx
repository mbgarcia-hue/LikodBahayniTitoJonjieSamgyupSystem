import { salesSummary } from '../../lib/sales';
import { useEffect } from 'react';
import { ShoppingCart, Users, DollarSign, AlertTriangle } from 'lucide-react';
import StatCard from '../../components/StatCard';
import { useRestaurant } from '../../context/RestaurantContext';
import { toast } from 'sonner';

export default function Dashboard() {
  const { orders, tables, transactions, getLowStockItems, getOutOfStockItems } = useRestaurant();

  const activeTables = tables.filter((t) => !t.hidden && t.status !== 'available').length;
  const totalTables = tables.filter(t => !t.hidden).length;
  const totalOrders = orders.length;
  const dailySales = salesSummary(transactions, orders).todaySales;
  const lowStockCount = getLowStockItems().length + getOutOfStockItems().length;
  const outOfStockCount = getOutOfStockItems().length;
  const lowStockOnlyCount = getLowStockItems().length;

  const recentOrders = orders.slice(-5).reverse();

  useEffect(() => {
    if (outOfStockCount > 0) {
      toast.error(`${outOfStockCount} item${outOfStockCount > 1 ? 's are' : ' is'} out of stock!`, { duration: 5000 });
    } else if (lowStockOnlyCount > 0) {
      toast.warning(`${lowStockOnlyCount} item${lowStockOnlyCount > 1 ? 's have' : ' has'} low stock!`, { duration: 5000 });
    }
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Dashboard Overview</h1>
        <p className="text-amber-500/60 mt-1">Here's what's happening today.</p>
      </div>

      {lowStockCount > 0 && (
        <div className="mb-6 rounded-xl bg-red-950/30 border border-red-500/40 p-4 shadow-md animate-pulse">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-600 p-2 shrink-0">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-300">Inventory Alert!</p>
              <p className="text-sm text-red-400/80">
                {lowStockCount} item{lowStockCount > 1 ? 's' : ''} with low or out of stock.{' '}
                <a href="/admin/inventory" className="font-semibold text-red-300 hover:text-red-200 underline">
                  Check inventory now
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard title="Total Orders" value={totalOrders} icon={ShoppingCart} color="gold" />
        <StatCard title="Active Tables" value={`${activeTables}/${totalTables}`} icon={Users} color="blue" />
        <StatCard title="Daily Sales" value={`₱${dailySales.toLocaleString()}`} icon={DollarSign} color="green" />
        <StatCard title="Low Stock Alerts" value={lowStockCount} icon={AlertTriangle} color="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Recent Orders</h2>
          <div className="space-y-3">
            {recentOrders.length === 0 && (
              <p className="text-amber-500/50 text-sm py-4 text-center">No recent orders</p>
            )}
            {recentOrders.map((order) => (
              <div key={order.id} className="rounded-lg bg-[#1A1210] border border-amber-600/20 p-4 hover:border-amber-600/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-amber-200">{order.id}</p>
                    <p className="text-sm text-amber-500/60">Table {order.tableNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-400">₱{order.totalAmount.toLocaleString()}</p>
                    <span className={`inline-block mt-1 rounded-full px-2 py-1 text-xs font-medium ${
                      order.status === 'completed' ? 'bg-green-900/40 text-green-400 border border-green-600/40'
                      : order.status === 'preparing' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-600/40'
                      : order.status === 'ready' ? 'bg-blue-900/40 text-blue-400 border border-blue-600/40'
                      : 'bg-amber-900/40 text-amber-400 border border-amber-600/40'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Critical Alerts</h2>
          <div className="space-y-3">
            {getOutOfStockItems().length === 0 && getLowStockItems().length === 0 && (
              <p className="text-amber-500/50 text-sm py-4 text-center">All stock levels are healthy</p>
            )}
            {getOutOfStockItems().map((item) => (
              <div key={item.id} className="rounded-lg bg-red-950/30 border border-red-500/40 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-red-700 p-2 shrink-0">
                    <AlertTriangle className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-amber-200">{item.name}</p>
                    <p className="text-sm text-red-400">Out of Stock</p>
                  </div>
                  <span className="rounded-full bg-red-700/50 border border-red-500/40 px-3 py-1 text-xs font-medium text-red-300">
                    0 {item.unit}
                  </span>
                </div>
              </div>
            ))}
            {getLowStockItems().map((item) => (
              <div key={item.id} className="rounded-lg bg-amber-950/30 border border-amber-500/40 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-amber-700 p-2 shrink-0">
                    <AlertTriangle className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-amber-200">{item.name}</p>
                    <p className="text-sm text-amber-500">Low Stock</p>
                  </div>
                  <span className="rounded-full bg-amber-700/50 border border-amber-500/40 px-3 py-1 text-xs font-medium text-amber-300">
                    {item.currentStock} {item.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
