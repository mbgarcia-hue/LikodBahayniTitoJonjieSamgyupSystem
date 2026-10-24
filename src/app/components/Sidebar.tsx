import { Link, useLocation, useNavigate } from 'react-router';
import { LucideIcon, LogOut } from 'lucide-react';
import { useRestaurant } from '../context/RestaurantContext';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import restaurantLogo from '@/imports/685301822_878436815273126_809105010315524518_n-removebg-preview.png';

export interface SidebarNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  inventoryBadge?: boolean;
}

interface SidebarProps {
  navItems: SidebarNavItem[];
  logoutPath: string;
}

export default function Sidebar({ navItems, logoutPath }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { getLowStockItems, getOutOfStockItems } = useRestaurant();

  const lowStockCount = getLowStockItems().length + getOutOfStockItems().length;

  return (
    <div className="flex h-full w-64 flex-col bg-[#1A1210] border-r border-amber-600/30">
      <div className="border-b border-amber-600/30 p-6">
        <div className="mb-3 flex justify-center">
          <ImageWithFallback
            src={restaurantLogo}
            alt="Likod Bahay ni Tito Jonjie Logo"
            className="h-20 w-20 object-contain drop-shadow-lg"
          />
        </div>
        <h1 className="text-sm font-bold text-amber-300 text-center leading-tight" style={{ fontFamily: "'Cinzel', serif" }}>
          Likod Bahay ni Tito Jonjie
        </h1>
        <p className="text-xs text-amber-600/80 mt-1 text-center tracking-widest uppercase">Samgyupsal</p>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const showBadge = item.inventoryBadge && lowStockCount > 0;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all relative ${
                isActive
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-[#1A1210] shadow-lg shadow-amber-900/30'
                  : 'text-amber-200/80 hover:bg-amber-600/15 hover:text-amber-200'
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-sm font-medium">{item.label}</span>
              {showBadge && (
                <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white animate-pulse">
                  {lowStockCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-amber-600/30 p-4">
        <button
          onClick={async () => { await fetch('/api/staff/logout', { method: 'POST' }); window.location.href = logoutPath; }}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-amber-200/70 transition-all hover:bg-amber-600/15 hover:text-amber-200"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
