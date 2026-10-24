import StaffGate from '../components/StaffGate';
import { Outlet } from 'react-router';
import Sidebar from '../components/Sidebar';
import { LayoutDashboard, TrendingUp, User } from 'lucide-react';

const ownerNav = [
  { path: '/owner', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/owner/sales', label: 'Sales Reports', icon: TrendingUp },
  { path: '/owner/profile', label: 'Profile', icon: User },
];

export default function OwnerLayout() {
  return (
    <StaffGate>
    <div className="flex h-screen bg-[#1A1210]">
      <Sidebar navItems={ownerNav} logoutPath="/owner/login" />
      <main className="flex-1 overflow-y-auto bg-[#1A1210]">
        <Outlet />
      </main>
    </div>
    </StaffGate>
  );
}
