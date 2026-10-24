import StaffGate from '../components/StaffGate';
import { Outlet } from 'react-router';
import Sidebar from '../components/Sidebar';
import { LayoutDashboard, ShoppingBag, Receipt, Package, TrendingUp, User } from 'lucide-react';

const adminNav = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { path: '/admin/billing', label: 'Tables & Billing', icon: Receipt },
  { path: '/admin/inventory', label: 'Inventory', icon: Package, inventoryBadge: true },
  { path: '/admin/sales', label: 'Sales Monitoring', icon: TrendingUp },
  { path: '/admin/profile', label: 'Profile', icon: User },
];

export default function AdminLayout() {
  return (
    <StaffGate>
    <div className="flex h-screen bg-[#1A1210]">
      <Sidebar navItems={adminNav} logoutPath="/admin/login" />
      <main className="flex-1 overflow-y-auto bg-[#1A1210]">
        <Outlet />
      </main>
    </div>
    </StaffGate>
  );
}
