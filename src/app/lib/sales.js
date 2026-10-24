const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
export function dayKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = Object.fromEntries(dayFormat.formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function salesSummary(transactions, orders, now = new Date()) {
  const today = dayKey(now); const midnight = new Date(`${today}T00:00:00+08:00`);
  const salesData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(midnight.getTime() - (6 - i) * 86400000); const key = dayKey(date);
    return { date: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(date), sales: transactions.filter(t => dayKey(t.timestamp) === key).reduce((n, t) => n + t.totalBill, 0) };
  });
  const paid = new Set(transactions.map(t => t.sessionId).filter(Boolean));
  const products = new Map();
  for (const order of orders.filter(o => paid.has(o.sessionId) && o.status !== 'cancelled')) for (const item of order.items) {
    const product = products.get(item.name) || { name: item.name, sold: 0, revenue: 0 };
    product.sold += item.quantity; product.revenue += item.quantity * item.price; products.set(item.name, product);
  }
  return { salesData, bestSellingProducts: [...products.values()].sort((a, b) => b.sold - a.sold).slice(0, 10), totalRevenue: salesData.reduce((n, d) => n + d.sales, 0), todaySales: salesData[6].sales };
}
