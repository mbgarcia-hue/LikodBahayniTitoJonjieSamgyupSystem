import StaffGate from '../components/StaffGate';
import { Outlet } from 'react-router';
import Sidebar from '../components/Sidebar';
import { ShoppingBag, Package, User } from 'lucide-react';
import { PesoReceipt } from '../components/PesoSign';

const cashierNav = [
  { path: '/cashier/orders', label: 'Orders', icon: ShoppingBag },
  { path: '/cashier/billing', label: 'Tables & Billing', icon: PesoReceipt },
  { path: '/cashier/inventory', label: 'Inventory', icon: Package },
  { path: '/cashier/profile', label: 'Profile', icon: User },
];

export default function CashierLayout() {
  return (
    <StaffGate>
    <div className="flex h-screen bg-[#1A1210]">
      <Sidebar navItems={cashierNav} logoutPath="/cashier/login" showGreeting />
      <main className="flex-1 overflow-y-auto bg-[#1A1210]">
        <Outlet />
      </main>
    </div>
    </StaffGate>
  );
}
