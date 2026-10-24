import { DollarSign, ShoppingCart, Users, TrendingUp } from 'lucide-react';
import StatCard from '../../components/StatCard';
import { useRestaurant } from '../../context/RestaurantContext';
import { salesSummary } from '../../lib/sales';
import { format } from 'date-fns';

export default function OwnerDashboard() {
  const { orders, tables, transactions } = useRestaurant();

  const activeTables = tables.filter((t) => !t.hidden && t.status !== 'available').length;
  const totalTables = tables.filter(t => !t.hidden).length;
  const totalOrders = orders.length;
  const { salesData, totalRevenue } = salesSummary(transactions, orders);
  const transactionRevenue = transactions.reduce((sum, txn) => sum + txn.totalBill, 0);

  const recentTransactions = [...transactions].sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp)).slice(0, 8);

  const dailyAvg = salesData.length > 0 ? Math.round(totalRevenue / salesData.length) : 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Owner Dashboard</h1>
        <p className="text-amber-500/60 mt-1">Restaurant performance overview and transaction summary</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard title="Weekly Revenue" value={`₱${totalRevenue.toLocaleString()}`} icon={DollarSign} color="gold" />
        <StatCard title="Avg. Daily Sales" value={`₱${dailyAvg.toLocaleString()}`} icon={TrendingUp} color="blue" />
        <StatCard title="Active Tables" value={`${activeTables}/${totalTables}`} icon={Users} color="green" />
        <StatCard title="Total Orders" value={totalOrders} icon={ShoppingCart} color="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
          <p className="text-sm text-amber-500/60 mb-1">Transaction Revenue</p>
          <p className="text-4xl font-bold text-amber-300">₱{transactionRevenue.toLocaleString()}</p>
          <p className="text-sm text-amber-500/50 mt-2">from {transactions.length} completed transactions</p>
        </div>
        <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
          <p className="text-sm text-amber-500/60 mb-1">Cash Payments</p>
          <p className="text-4xl font-bold text-green-400">
            {transactions.filter(t => t.paymentMethod === 'cash').length}
          </p>
          <p className="text-sm text-amber-500/50 mt-2">transactions via cash</p>
        </div>
        <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
          <p className="text-sm text-amber-500/60 mb-1">Online Payments</p>
          <p className="text-4xl font-bold text-blue-400">
            {transactions.filter(t => t.paymentMethod === 'online').length}
          </p>
          <p className="text-sm text-amber-500/50 mt-2">Online Payment</p>
        </div>
      </div>

      <div className="rounded-xl bg-[#252018] border border-amber-600/30 shadow-md overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-amber-600/30">
          <h2 className="text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1A1210] border-b border-amber-600/30">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-amber-400/80">Transaction ID</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-amber-400/80">Table</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-amber-400/80">Amount</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-amber-400/80">Method</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-amber-400/80">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-600/20">
              {recentTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-amber-500/50 text-sm">No transactions recorded yet</td>
                </tr>
              )}
              {recentTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-amber-600/10 transition-colors">
                  <td className="px-6 py-3 text-sm text-amber-400/70">{t.id}</td>
                  <td className="px-6 py-3 font-medium text-amber-200">Table {t.tableNumber}</td>
                  <td className="px-6 py-3 font-semibold text-amber-400">₱{t.totalBill.toLocaleString()}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium border ${
                      t.paymentMethod === 'cash'
                        ? 'bg-green-900/40 text-green-400 border-green-600/40'
                        : 'bg-blue-900/40 text-blue-400 border-blue-600/40'
                    }`}>
                      {t.paymentMethod === 'cash' ? 'Cash' : 'Online'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-amber-400/60">
                    {format(new Date(t.timestamp), 'MMM d, h:mm a')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>7-Day Sales Breakdown</h2>
        <div className="space-y-3">
          {salesData.map((day) => {
            const pct = Math.round((day.sales / Math.max(1, ...salesData.map(d => d.sales))) * 100);
            return (
              <div key={day.date} className="flex items-center gap-4">
                <span className="w-16 text-sm text-amber-400/70 shrink-0">{day.date}</span>
                <div className="flex-1 h-6 rounded-full bg-[#1A1210] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-24 text-right text-sm font-semibold text-amber-300 shrink-0">
                  ₱{day.sales.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
