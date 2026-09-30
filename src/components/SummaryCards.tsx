import React from 'react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  Percent, 
  Smartphone, 
  Building2, 
  CreditCard, 
  Banknote,
  TrendingUp,
  Check
} from 'lucide-react';
import { Account, MonthlyStats } from '../types/finance.ts';
import { formatRupiah, getMonthYearLabel } from '../utils/formatters.ts';

interface SummaryCardsProps {
  stats: MonthlyStats;
  accounts: Account[];
  activeAccountId: string;
  onSelectAccount: (accountId: string) => void;
  selectedMonthYear: string;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  stats,
  accounts,
  activeAccountId,
  onSelectAccount,
  selectedMonthYear,
}) => {
  const getAccountIcon = (iconName: string) => {
    switch (iconName) {
      case 'Banknote': return <Banknote className="w-4 h-4 text-emerald-400" />;
      case 'Smartphone': return <Smartphone className="w-4 h-4 text-sky-400" />;
      case 'Building2': return <Building2 className="w-4 h-4 text-amber-400" />;
      case 'CreditCard': return <CreditCard className="w-4 h-4 text-orange-400" />;
      default: return <Wallet className="w-4 h-4 text-slate-400" />;
    }
  };

  const isHealthy = stats.sisaSaldo >= 0;

  return (
    <div className="space-y-4">
      {/* Top Banner KPI Summary: Masuk, Keluar, Sisa */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        
        {/* Total Masuk */}
        <div className="relative overflow-hidden bg-slate-900/80 rounded-2xl border border-emerald-500/20 p-4 shadow-sm backdrop-blur hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Masuk ({getMonthYearLabel(selectedMonthYear)})
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400 tracking-tight">
              {formatRupiah(stats.totalMasuk)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pemasukan & transfer masuk</span>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Total Keluar */}
        <div className="relative overflow-hidden bg-slate-900/80 rounded-2xl border border-rose-500/20 p-4 shadow-sm backdrop-blur hover:border-rose-500/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Keluar ({getMonthYearLabel(selectedMonthYear)})
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-400 tracking-tight">
              {formatRupiah(stats.totalKeluar)}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
            <span>Rasio pengeluaran: </span>
            <span className="font-semibold text-slate-300">
              {stats.totalMasuk > 0 ? ((stats.totalKeluar / stats.totalMasuk) * 100).toFixed(1) : 0}%
            </span>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-rose-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Sisa Saldo & Persentase Sisa */}
        <div className={`relative overflow-hidden bg-slate-900/80 rounded-2xl border p-4 shadow-sm backdrop-blur transition ${
          isHealthy ? 'border-sky-500/20 hover:border-sky-500/40' : 'border-amber-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Sisa Saldo Periode
            </span>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 text-xs font-bold border border-sky-500/20">
              <Percent className="w-3 h-3" />
              <span>{stats.sisaPersen.toFixed(2)}%</span>
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-black tracking-tight ${isHealthy ? 'text-sky-300' : 'text-amber-400'}`}>
              {formatRupiah(stats.sisaSaldo)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-sky-400 to-emerald-400 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, Math.max(0, stats.sisaPersen))}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 shrink-0 font-medium">
              {stats.sisaPersen > 0 ? 'Surplus' : 'Defisit'}
            </span>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-sky-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

      </div>

      {/* Account Balances (Dompet Toko & Pribadi: Cash, Dana, Seabank, ShopeePay) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Saldo Dompet / Akun (Klik untuk filter)
            </h2>
          </div>
          {activeAccountId !== 'ALL' && (
            <button
              onClick={() => onSelectAccount('ALL')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium underline flex items-center gap-1"
            >
              Reset filter akun
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {accounts.map((acc) => {
            const currentBalance = stats.accountBalances[acc.id] ?? 0;
            const isSelected = activeAccountId === acc.id;

            return (
              <button
                key={acc.id}
                onClick={() => onSelectAccount(isSelected ? 'ALL' : acc.id)}
                className={`text-left p-3.5 rounded-xl border transition-all relative overflow-hidden group cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/95 border-emerald-500 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center group-hover:scale-105 transition">
                      {getAccountIcon(acc.iconName)}
                    </div>
                    <span className="font-bold text-xs sm:text-sm text-slate-200">
                      {acc.name}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>

                <div className="mt-2.5">
                  <div className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                    {formatRupiah(currentBalance)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${currentBalance >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span>{acc.type.toUpperCase()}</span>
                  </div>
                </div>

                {/* Account accent glow */}
                <div 
                  className="absolute bottom-0 left-0 right-0 h-0.5 opacity-60"
                  style={{ backgroundColor: acc.color }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
