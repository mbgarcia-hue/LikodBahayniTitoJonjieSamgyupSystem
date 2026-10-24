import { TrendingUp, DollarSign, ShoppingBag, Award, Receipt } from 'lucide-react';
import { salesSummary } from '../../lib/sales';
import StatCard from '../../components/StatCard';
import { useRestaurant } from '../../context/RestaurantContext';
import { format } from 'date-fns';

function LineChart({ data }: { data: { date: string; sales: number }[] }) {
  const width = 500;
  const height = 260;
  const padL = 52, padR = 16, padT = 16, padB = 36;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxVal = Math.max(1, ...data.map(d => d.sales));
  const minVal = 0;
  const xStep = chartW / (data.length - 1);
  const toX = (i: number) => padL + i * xStep;
  const toY = (v: number) => padT + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;
  const points = data.map((d, i) => `${toX(i)},${toY(d.sales)}`).join(' ');
  const areaPoints = `${toX(0)},${padT + chartH} ${points} ${toX(data.length - 1)},${padT + chartH}`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => minVal + t * (maxVal - minVal));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[260px]">
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={padL} x2={padL + chartW} y1={toY(tick)} y2={toY(tick)} stroke="rgba(200,146,42,0.2)" strokeDasharray="3 3" />
          <text x={padL - 6} y={toY(tick) + 4} textAnchor="end" fontSize={11} fill="#7A6245">
            {(tick / 1000).toFixed(0)}k
          </text>
        </g>
      ))}
      {data.map((d, i) => (
        <text key={i} x={toX(i)} y={height - 6} textAnchor="middle" fontSize={10} fill="#7A6245">{d.date}</text>
      ))}
      <polygon points={areaPoints} fill="rgba(200,146,42,0.12)" />
      <polyline points={points} fill="none" stroke="#C8922A" strokeWidth={2.5} strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d.sales)} r={4} fill="#C8922A" />
      ))}
    </svg>
  );
}

function BarChart({ data }: { data: { date: string; sales: number }[] }) {
  const width = 500;
  const height = 260;
  const padL = 52, padR = 16, padT = 16, padB = 36;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxVal = Math.max(1, ...data.map(d => d.sales));
  const barW = (chartW / data.length) * 0.6;
  const gap = chartW / data.length;
  const toY = (v: number) => padT + chartH - (v / maxVal) * chartH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => t * maxVal);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[260px]">
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={padL} x2={padL + chartW} y1={toY(tick)} y2={toY(tick)} stroke="rgba(200,146,42,0.2)" strokeDasharray="3 3" />
          <text x={padL - 6} y={toY(tick) + 4} textAnchor="end" fontSize={11} fill="#7A6245">
            {(tick / 1000).toFixed(0)}k
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * gap + gap / 2 - barW / 2;
        const barH = (d.sales / maxVal) * chartH;
        const y = padT + chartH - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill="url(#barGrad)" />
            <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize={10} fill="#7A6245">{d.date}</text>
          </g>
        );
      })}
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E07B29" />
          <stop offset="100%" stopColor="#C8922A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function DonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[260px] text-amber-500/50 text-sm">
        No transaction data yet
      </div>
    );
  }
  const cx = 130, cy = 130, r = 90, innerR = 55;
  let angle = -Math.PI / 2;
  const slices = data.map(d => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const start = angle;
    angle += sweep;
    return { ...d, start, sweep };
  });

  const arc = (cx: number, cy: number, r: number, start: number, sweep: number) => {
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(start + sweep);
    const y2 = cy + r * Math.sin(start + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const xi1 = cx + innerR * Math.cos(start + sweep);
    const yi1 = cy + innerR * Math.sin(start + sweep);
    const xi2 = cx + innerR * Math.cos(start);
    const yi2 = cy + innerR * Math.sin(start);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${innerR} ${innerR} 0 ${large} 0 ${xi2} ${yi2} Z`;
  };

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 260 260" className="w-[180px] h-[180px] shrink-0">
        {slices.length === 1 ? <circle cx={cx} cy={cy} r={(r + innerR) / 2} fill="none" stroke={slices[0].color} strokeWidth={r - innerR} /> : slices.map((s, i) => (
          <path key={i} d={arc(cx, cy, r, s.start, s.sweep)} fill={s.color} opacity={0.9} />
        ))}
        <circle cx={cx} cy={cy} r={innerR - 2} fill="#252018" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight="bold" fill="#F5DEB3">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="#7A6245">total</text>
      </svg>
      <div className="space-y-3">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-sm text-amber-200">{s.name}</span>
            <span className="text-sm font-semibold text-amber-400 ml-auto pl-4">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Sales() {
  const { transactions, orders } = useRestaurant();
  const { salesData, bestSellingProducts, totalRevenue, todaySales } = salesSummary(transactions, orders);

  const averageDailySales = totalRevenue / salesData.length;
  const totalOrders = orders.length;
  const transactionRevenue = transactions.reduce((sum, txn) => sum + txn.totalBill, 0);

  const paymentMethodData = [
    { name: 'Cash', value: transactions.filter(t => t.paymentMethod === 'cash').length, color: '#16A34A' },
    { name: 'Online', value: transactions.filter(t => t.paymentMethod === 'online').length, color: '#2563EB' },
  ].filter(entry => entry.value > 0);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Sales Monitoring</h1>
        <p className="text-amber-500/60 mt-1">Track revenue, analytics, and performance metrics</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard title="Total Revenue (7 Days)" value={`₱${totalRevenue.toLocaleString()}`} icon={DollarSign} color="gold" />
        <StatCard title="Average Daily Sales" value={`₱${Math.round(averageDailySales).toLocaleString()}`} icon={TrendingUp} color="blue" />
        <StatCard title="Today's Sales" value={`₱${todaySales.toLocaleString()}`} icon={DollarSign} color="green" />
        <StatCard title="Total Orders" value={totalOrders} icon={ShoppingBag} color="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Weekly Sales Trend</h2>
          <LineChart data={salesData} />
        </div>

        <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Daily Sales Comparison</h2>
          <BarChart data={salesData} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
          <div className="flex items-center gap-3 mb-6">
            <Receipt className="h-6 w-6 text-amber-500" />
            <h2 className="text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Payment Method Distribution</h2>
          </div>
          <DonutChart data={paymentMethodData} />
        </div>

        <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md">
          <div className="flex items-center gap-3 mb-6">
            <DollarSign className="h-6 w-6 text-amber-500" />
            <h2 className="text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Transaction Summary</h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg bg-[#1A1210] border border-amber-600/20 p-4">
              <p className="text-sm text-amber-500/60">Total Transactions</p>
              <p className="text-3xl font-bold text-amber-200">{transactions.length}</p>
            </div>
            <div className="rounded-lg bg-[#1A1210] border border-green-600/30 p-4">
              <p className="text-sm text-amber-500/60">Total Revenue (Transactions)</p>
              <p className="text-3xl font-bold text-green-400">₱{transactionRevenue.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-[#1A1210] border border-blue-600/30 p-4">
              <p className="text-sm text-amber-500/60">Average Transaction Value</p>
              <p className="text-3xl font-bold text-blue-400">
                ₱{transactions.length > 0 ? Math.round(transactionRevenue / transactions.length).toLocaleString() : '0'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-[#252018] border border-amber-600/30 shadow-md mb-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-amber-600/30 flex items-center gap-3">
          <Receipt className="h-6 w-6 text-amber-500" />
          <h2 className="text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Recent Transaction History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1A1210] border-b border-amber-600/30">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-amber-400/80">Transaction ID</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-amber-400/80">Table</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-amber-400/80">Amount</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-amber-400/80">Payment Method</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-amber-400/80">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-600/20">
              {transactions.slice(0, 10).map((transaction) => (
                <tr key={transaction.id} className="hover:bg-amber-600/10 transition-colors">
                  <td className="px-4 py-3 text-sm text-amber-400/70">{transaction.id}</td>
                  <td className="px-4 py-3 font-medium text-amber-200">Table {transaction.tableNumber}</td>
                  <td className="px-4 py-3 font-semibold text-amber-400">₱{transaction.totalBill.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium border ${
                      transaction.paymentMethod === 'cash'
                        ? 'bg-green-900/40 text-green-400 border-green-600/40'
                        : 'bg-blue-900/40 text-blue-400 border-blue-600/40'
                    }`}>
                      {transaction.paymentMethod === 'cash' ? 'Cash' : 'Online'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-amber-400/60">
                    {format(new Date(transaction.timestamp), 'MMM d, h:mm a')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-[#252018] border border-amber-600/30 shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-amber-600/30 flex items-center gap-3">
          <Award className="h-6 w-6 text-amber-500" />
          <h2 className="text-xl font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>Best Selling Products</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#1A1210] border-b border-amber-600/30">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Rank</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Product Name</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Units Sold</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-amber-400/80">Revenue Generated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-600/20">
              {bestSellingProducts.map((product, index) => (
                <tr key={product.name} className="hover:bg-amber-600/10 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 text-white font-bold text-sm shadow-sm">
                      {index + 1}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-amber-200">{product.name}</td>
                  <td className="px-6 py-4 text-amber-400/70">{product.sold}</td>
                  <td className="px-6 py-4 font-semibold text-amber-400">₱{product.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
