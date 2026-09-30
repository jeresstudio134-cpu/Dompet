import React from 'react';
import { 
  PieChart, 
  TrendingDown, 
  TrendingUp, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet,
  Sparkles,
  Award
} from 'lucide-react';
import { Transaction, MonthlyStats, Account } from '../types/finance.ts';
import { formatRupiah, getMonthYearLabel } from '../utils/formatters.ts';

interface CategoryAnalyticsProps {
  stats: MonthlyStats;
  selectedMonthYear: string;
  transactions: Transaction[];
  accounts: Account[];
}

export const CategoryAnalytics: React.FC<CategoryAnalyticsProps> = ({
  stats,
  selectedMonthYear,
  transactions,
  accounts,
}) => {
  // Sort category breakdown descending
  const sortedCategories = Object.entries(stats.categoryBreakdown)
    .filter(([_, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);

  const totalExpense = stats.totalKeluar || 1; // avoid divide by zero

  // Top 5 largest expenses
  const topExpenses = transactions
    .filter(t => t.type === 'keluar')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Group expenses by day for the trend chart
  const sortedDays = Object.entries(stats.dailyExpenses)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const maxDailyExpense = sortedDays.reduce((max, [_, val]) => Math.max(max, val), 1);

  return (
    <div className="space-y-6">
      
      {/* Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Category Breakdown (Pengeluaran Berdasarkan Kategori) */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-white text-sm sm:text-base">
                Rincian Pengeluaran per Kategori
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              {sortedCategories.length} Kategori Aktif
            </span>
          </div>

          {sortedCategories.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              Belum ada pengeluaran pada periode ini.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedCategories.map(([category, amount], idx) => {
                const percentage = (amount / totalExpense) * 100;
                
                // Color mapping
                const colors = [
                  'from-emerald-500 to-teal-400',
                  'from-sky-500 to-blue-400',
                  'from-amber-500 to-orange-400',
                  'from-purple-500 to-indigo-400',
                  'from-rose-500 to-pink-400',
                  'from-cyan-500 to-emerald-400',
                ];
                const barColor = colors[idx % colors.length];

                return (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-600" />
                        <span className="font-semibold text-slate-200">{category}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-white">{formatRupiah(amount)}</span>
                        <span className="text-slate-400 text-xs w-12 text-right">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-700`}
                        style={{ width: `${Math.min(100, Math.max(2, percentage))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Total Pengeluaran:</span>
            <span className="text-rose-400 font-mono text-sm font-bold">
              {formatRupiah(stats.totalKeluar)}
            </span>
          </div>
        </div>

        {/* Top 5 Pengeluaran Terbesar & Health Score */}
        <div className="space-y-6">
          
          {/* Top 5 Expenses */}
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm sm:text-base">
                  Top 5 Pengeluaran Terbesar ({getMonthYearLabel(selectedMonthYear)})
                </h3>
              </div>
            </div>

            {topExpenses.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-sm">
                Belum ada pengeluaran tercatat.
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {topExpenses.map((tx, i) => (
                  <div key={tx.id} className="py-2.5 flex items-center justify-between text-xs sm:text-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">{tx.description}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <span>{tx.date}</span>
                          <span>•</span>
                          <span className="text-amber-300">{tx.category}</span>
                        </div>
                      </div>
                    </div>
                    <div className="font-mono font-bold text-rose-400 whitespace-nowrap">
                      {formatRupiah(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cashflow Ratio Card */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/80 rounded-2xl border border-slate-800 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Rasio Keuangan Bulan Ini
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                stats.sisaSaldo >= 0 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}>
                {stats.sisaSaldo >= 0 ? 'Kondisi Sehat (Surplus)' : 'Pengeluaran Melebihi Masuk'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <span className="text-[11px] text-slate-400">Tingkat Tabungan (Sisa):</span>
                <p className="text-xl font-black text-sky-400 font-mono mt-0.5">
                  {stats.sisaPersen.toFixed(1)}%
                </p>
              </div>
              <div>
                <span className="text-[11px] text-slate-400">Rasio Pengeluaran:</span>
                <p className="text-xl font-black text-rose-400 font-mono mt-0.5">
                  {stats.totalMasuk > 0 ? ((stats.totalKeluar / stats.totalMasuk) * 100).toFixed(1) : '100'}%
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Daily Expenses Bar Chart */}
      {sortedDays.length > 0 && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-sky-400" />
              <h3 className="font-bold text-white text-sm sm:text-base">
                Tren Pengeluaran Harian
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Puncak: {formatRupiah(maxDailyExpense)}
            </span>
          </div>

          <div className="h-44 flex items-end gap-1.5 sm:gap-2 pt-4 px-2 overflow-x-auto">
            {sortedDays.map(([day, amount]) => {
              const heightPercent = Math.min(100, Math.max(8, (amount / maxDailyExpense) * 100));
              const dayNum = day.split('-')[2] || day;

              return (
                <div 
                  key={day} 
                  className="flex-1 min-w-[28px] max-w-[40px] flex flex-col items-center gap-1.5 group cursor-pointer"
                  title={`${day}: ${formatRupiah(amount)}`}
                >
                  {/* Tooltip on hover */}
                  <div className="text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap bg-slate-800 px-1 py-0.5 rounded shadow">
                    {amount >= 1000 ? `${(amount/1000).toFixed(0)}k` : amount}
                  </div>

                  {/* Bar */}
                  <div className="w-full bg-slate-800/80 rounded-t-md overflow-hidden flex items-end h-28">
                    <div 
                      className="w-full rounded-t-md bg-gradient-to-t from-rose-600 to-rose-400 group-hover:from-rose-500 group-hover:to-rose-300 transition-all duration-300"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>

                  {/* Day label */}
                  <span className="text-[10px] text-slate-400 group-hover:text-white font-medium">
                    {dayNum}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
