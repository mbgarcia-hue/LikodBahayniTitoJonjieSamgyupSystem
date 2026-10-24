import { Link } from 'react-router';
import { Smartphone, ChefHat, Receipt, Crown } from 'lucide-react';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import restaurantLogo from '@/imports/685301822_878436815273126_809105010315524518_n-removebg-preview.png';

const roles = [
  {
    to: '/customer/1',
    icon: Smartphone,
    iconBg: 'from-orange-500 to-amber-600',
    title: 'Customer',
    description: 'Browse the menu and place orders via QR code',
  },
  {
    to: '/cashier/login',
    icon: Receipt,
    iconBg: 'from-amber-600 to-amber-800',
    title: 'Cashier',
    description: 'Manage orders, process payments, and monitor inventory',
  },
  {
    to: '/kitchen/login',
    icon: ChefHat,
    iconBg: 'from-amber-700 to-orange-600',
    title: 'Kitchen',
    description: 'Monitor incoming orders and update preparation status',
  },
  {
    to: '/owner/login',
    icon: Crown,
    iconBg: 'from-yellow-500 to-amber-600',
    title: 'Owner',
    description: 'View sales reports and monitor restaurant performance',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1A1210]">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 via-transparent to-amber-900/10 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(200,146,42,0.08)_0%,_transparent_70%)] pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-6 py-12 text-center">
        <div className="mb-6 flex justify-center">
          <ImageWithFallback
            src={restaurantLogo}
            alt="Likod Bahay ni Tito Jonjie Logo"
            className="h-40 w-40 object-contain drop-shadow-2xl"
          />
        </div>
        <h1 className="mb-3 text-4xl font-bold text-amber-300 tracking-wide" style={{ fontFamily: "'Cinzel', serif" }}>
          Likod Bahay ni Tito Jonjie
        </h1>
        <p className="mb-2 text-lg text-amber-500 tracking-widest uppercase" style={{ fontFamily: "'Cinzel', serif" }}>
          Samgyupsal
        </p>
        <p className="mb-12 text-base text-amber-200/60">
          Restaurant Management System
        </p>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => (
            <Link
              key={role.to}
              to={role.to}
              className="group rounded-2xl bg-[#252018] border border-amber-600/40 p-7 shadow-xl transition-all hover:scale-105 hover:shadow-amber-900/40 hover:shadow-2xl hover:border-amber-500/70"
            >
              <div className="mb-4 flex justify-center">
                <div className={`rounded-full bg-gradient-to-br ${role.iconBg} p-4 shadow-lg`}>
                  <role.icon className="h-10 w-10 text-amber-100" />
                </div>
              </div>
              <h2 className="mb-2 text-lg font-semibold text-amber-300" style={{ fontFamily: "'Cinzel', serif" }}>
                {role.title}
              </h2>
              <p className="text-sm text-amber-200/60 leading-relaxed">
                {role.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
