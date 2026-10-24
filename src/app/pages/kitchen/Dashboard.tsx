import { Link } from 'react-router';
import { ArrowLeft, Clock, ChefHat, CheckCircle, Package, AlertCircle } from 'lucide-react';
import { useRestaurant } from '../../context/RestaurantContext';
import { format } from 'date-fns';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import restaurantLogo from '@/imports/685301822_878436815273126_809105010315524518_n-removebg-preview.png';

export default function Dashboard() {
  const { orders, updateOrderStatus } = useRestaurant();

  const getOrdersByStatus = (status: string) => {
    return orders.filter((order) => order.status === status);
  };

  const pendingOrders = getOrdersByStatus('approved');
  const preparingOrders = getOrdersByStatus('preparing');
  const readyOrders = getOrdersByStatus('ready');
  const servedOrders = getOrdersByStatus('served');

  const handleStatusChange = (orderId: string, newStatus: any) => {
    updateOrderStatus(orderId, newStatus);
  };

  const OrderCard = ({ order, actions, statusLabel, statusIcon: StatusIcon }: any) => (
    <div data-batch-id={order.id} className="rounded-xl bg-[#252018] border border-amber-600/30 p-4 shadow-lg hover:shadow-amber-900/20 hover:shadow-xl transition-shadow">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-amber-200">Batch {order.batchNumber}</h3>
          <p className="text-sm text-amber-400/60">Table {order.tableNumber}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 text-amber-400/60 text-xs">
            <Clock className="h-3 w-3" />
            {format(new Date(order.timeOrdered), 'h:mm a')}
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-900/40 border border-amber-600/40">
            <StatusIcon className="h-3 w-3 text-amber-500" />
            <span className="text-xs font-semibold text-amber-400">{statusLabel}</span>
          </div>
        </div>
      </div>

      {order.approvalType === 'automatic' && <p className="mb-3 text-sm text-amber-300">Follow-up batch · direct to kitchen</p>}
      <div className="mb-3 space-y-2 bg-[#1A1210] rounded-lg p-3 border border-amber-600/20">
        <p className="text-xs font-semibold text-amber-500/80 mb-1 tracking-wider">ITEMS TO PREPARE:</p>
        {order.items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between text-sm">
            <span className="text-amber-200 font-medium">
              <span className="inline-block bg-amber-700/40 text-amber-300 rounded-full px-2 py-0.5 text-xs font-bold mr-2">
                {item.quantity}x
              </span>
              {item.name}
            </span>
          </div>
        ))}
      </div>

      {order.customerNotes && (
        <div className="mb-3 rounded-lg bg-orange-900/20 border border-orange-600/40 p-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-orange-300">Special Instructions:</p>
              <p className="text-xs text-orange-400/80">{order.customerNotes}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {actions.map((action: any, idx: number) => (
          <button
            key={idx}
            onClick={() => handleStatusChange(order.id, action.status)}
            className={`w-full rounded-lg px-3 py-2.5 text-sm font-semibold transition-all shadow-md ${action.className}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#1A1210]">
      <div className="sticky top-0 z-10 border-b border-amber-600/30 bg-[#1A1210] p-6 shadow-lg shadow-black/30">
        <Link to="/" className="mb-3 flex items-center gap-2 text-amber-500/70 hover:text-amber-400 transition-colors">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Back to Home</span>
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-4"><div className="flex items-center gap-4"><Link to="/kitchen/profile" className="text-amber-300 text-sm">My profile</Link><button className="text-amber-300 text-sm" onClick={async () => { await fetch('/api/staff/logout', { method: 'POST' }); window.location.href = '/kitchen/login'; }}>Sign out</button></div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <ImageWithFallback
                src={restaurantLogo}
                alt="Tito Jonjie Logo"
                className="h-12 w-12 object-contain"
              />
              <h1 className="text-2xl font-bold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>
                Kitchen Dashboard
              </h1>
            </div>
            <p className="text-amber-500/60 ml-15 text-sm">First batches need cashier approval. Follow-up batches arrive automatically.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-700 to-amber-800 px-4 py-2 shadow-lg border border-amber-600/40">
            <ChefHat className="h-5 w-5 text-amber-200" />
            <span className="font-semibold text-amber-100">{orders.length} Active Orders</span>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Pending */}
          <div className="space-y-4">
            <div className="rounded-lg bg-[#252018] border border-amber-600/30 p-3 shadow-md">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                <h2 className="font-bold text-amber-300 text-sm tracking-wider" style={{ fontFamily: "'Cinzel', serif" }}>APPROVED BATCHES</h2>
                <span className="ml-auto rounded-full bg-amber-700/50 border border-amber-600/50 px-2.5 py-1 text-xs font-bold text-amber-200">
                  {pendingOrders.length}
                </span>
              </div>
              <p className="text-xs text-amber-500/50 mt-1">Cashier verified - waiting for kitchen acceptance</p>
            </div>
            <div className="space-y-3">
              {pendingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  statusLabel="APPROVED"
                  statusIcon={Clock}
                  actions={[{
                    label: '✓ Accept & Start Preparing',
                    status: 'preparing',
                    className: 'bg-gradient-to-r from-green-700 to-green-800 text-green-100 hover:from-green-600 hover:to-green-700 border border-green-600/40',
                  }]}
                />
              ))}
              {pendingOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-amber-600/50 bg-[#252018] rounded-lg border border-amber-600/20">
                  No new orders
                </div>
              )}
            </div>
          </div>

          {/* Preparing */}
          <div className="space-y-4">
            <div className="rounded-lg bg-[#252018] border border-orange-600/40 p-3 shadow-md">
              <div className="flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-orange-400" />
                <h2 className="font-bold text-orange-300 text-sm tracking-wider" style={{ fontFamily: "'Cinzel', serif" }}>PREPARING</h2>
                <span className="ml-auto rounded-full bg-orange-800/50 border border-orange-600/50 px-2.5 py-1 text-xs font-bold text-orange-200">
                  {preparingOrders.length}
                </span>
              </div>
              <p className="text-xs text-orange-500/50 mt-1">Currently cooking</p>
            </div>
            <div className="space-y-3">
              {preparingOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  statusLabel="PREPARING"
                  statusIcon={ChefHat}
                  actions={[{
                    label: '✓ Mark as Ready to Serve',
                    status: 'ready',
                    className: 'bg-gradient-to-r from-blue-800 to-blue-900 text-blue-100 hover:from-blue-700 hover:to-blue-800 border border-blue-600/40',
                  }]}
                />
              ))}
              {preparingOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-amber-600/50 bg-[#252018] rounded-lg border border-amber-600/20">
                  No orders being prepared
                </div>
              )}
            </div>
          </div>

          {/* Ready */}
          <div className="space-y-4">
            <div className="rounded-lg bg-[#252018] border border-blue-600/40 p-3 shadow-md">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-400" />
                <h2 className="font-bold text-blue-300 text-sm tracking-wider" style={{ fontFamily: "'Cinzel', serif" }}>READY TO SERVE</h2>
                <span className="ml-auto rounded-full bg-blue-800/50 border border-blue-600/50 px-2.5 py-1 text-xs font-bold text-blue-200">
                  {readyOrders.length}
                </span>
              </div>
              <p className="text-xs text-blue-500/50 mt-1">Waiting for server</p>
            </div>
            <div className="space-y-3">
              {readyOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  statusLabel="READY"
                  statusIcon={Package}
                  actions={[{
                    label: '✓ Confirm Served',
                    status: 'served',
                    className: 'bg-gradient-to-r from-purple-800 to-purple-900 text-purple-100 hover:from-purple-700 hover:to-purple-800 border border-purple-600/40',
                  }]}
                />
              ))}
              {readyOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-amber-600/50 bg-[#252018] rounded-lg border border-amber-600/20">
                  No orders ready
                </div>
              )}
            </div>
          </div>

          {/* Served */}
          <div className="space-y-4">
            <div className="rounded-lg bg-[#252018] border border-green-600/40 p-3 shadow-md">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <h2 className="font-bold text-green-300 text-sm tracking-wider" style={{ fontFamily: "'Cinzel', serif" }}>SERVED</h2>
                <span className="ml-auto rounded-full bg-green-800/50 border border-green-600/50 px-2.5 py-1 text-xs font-bold text-green-200">
                  {servedOrders.length}
                </span>
              </div>
              <p className="text-xs text-green-500/50 mt-1">Delivered to table</p>
            </div>
            <div className="space-y-3">
              {servedOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-xl bg-[#252018] border border-green-600/20 p-4 shadow-lg opacity-70"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-amber-200/70">{order.id}</h3>
                      <p className="text-sm text-amber-400/50">Table {order.tableNumber}</p>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-900/40 border border-green-600/30">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-xs font-semibold text-green-400">SERVED</span>
                    </div>
                  </div>
                  <p className="text-xs text-amber-600/40">{order.items.length} items completed</p>
                </div>
              ))}
              {servedOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-amber-600/50 bg-[#252018] rounded-lg border border-amber-600/20">
                  No served orders
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
