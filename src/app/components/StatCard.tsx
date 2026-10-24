import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: 'red' | 'gold' | 'green' | 'blue';
}

export default function StatCard({ title, value, icon: Icon, trend, trendUp, color = 'gold' }: StatCardProps) {
  const iconColorClasses = {
    red: 'bg-gradient-to-br from-red-700 to-red-900 text-red-100',
    gold: 'bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100',
    green: 'bg-gradient-to-br from-green-700 to-emerald-900 text-green-100',
    blue: 'bg-gradient-to-br from-blue-700 to-blue-900 text-blue-100',
  };

  return (
    <div className="rounded-xl bg-[#252018] border border-amber-600/30 p-6 shadow-md hover:shadow-amber-900/20 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-amber-400/60 font-medium">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-amber-100">{value}</p>
          {trend && (
            <p className={`mt-2 text-sm font-medium ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
              {trend}
            </p>
          )}
        </div>
        <div className={`rounded-lg ${iconColorClasses[color]} p-3 shadow-md`}>
          <Icon className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}
