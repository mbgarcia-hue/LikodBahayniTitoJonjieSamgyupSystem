import StaffGate from '../components/StaffGate';
import { Outlet } from 'react-router';
import Sidebar from '../components/Sidebar';
import { ShoppingBag, Receipt, Package, User } from 'lucide-react';

const cashierNav = [
  { path: '/cashier/orders', label: 'Orders', icon: ShoppingBag },
  { path: '/cashier/billing', label: 'Tables & Billing', icon: Receipt },
  { path: '/cashier/inventory', label: 'Inventory', icon: Package, inventoryBadge: true },
  { path: '/cashier/profile', label: 'Profile', icon: User },
];

export default function CashierLayout() {
  return (
    <StaffGate>
    <div className="flex h-screen bg-[#1A1210]">
      <Sidebar navItems={cashierNav} logoutPath="/cashier/login" />
      <main className="flex-1 overflow-y-auto bg-[#1A1210]">
        <Outlet />
      </main>
    </div>
    </StaffGate>
  );
}
