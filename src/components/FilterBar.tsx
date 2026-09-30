import React from 'react';
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Table, 
  BarChart3, 
  Tag, 
  Wallet,
  ArrowUpDown
} from 'lucide-react';
import { FilterState, Account } from '../types/finance.ts';
import { getMonthYearLabel } from '../utils/formatters.ts';

interface FilterBarProps {
  filter: FilterState;
  onFilterChange: (newFilter: Partial<FilterState>) => void;
  onResetFilters: () => void;
  accounts: Account[];
  categories: string[];
  monthOptions: { value: string; label: string }[];
  activeView: 'table' | 'analytics';
  onViewChange: (view: 'table' | 'analytics') => void;
  totalFilteredCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filter,
  onFilterChange,
  onResetFilters,
  accounts,
  categories,
  monthOptions,
  activeView,
  onViewChange,
  totalFilteredCount,
}) => {
  // Navigate to previous or next month in monthOptions
  const handlePrevMonth = () => {
    const currentIndex = monthOptions.findIndex(m => m.value === filter.monthYear);
    // monthOptions is sorted descending (e.g. 2026-08, 2026-07, 2026-06)
    // "Prev month" chronologically means next index in sorted array (unless it's ALL)
    if (currentIndex > 0 && currentIndex < monthOptions.length - 1) {
      onFilterChange({ monthYear: monthOptions[currentIndex + 1].value });
    } else if (currentIndex === -1 || filter.monthYear === 'ALL') {
      if (monthOptions.length > 1) {
        onFilterChange({ monthYear: monthOptions[1].value });
      }
    }
  };

  const handleNextMonth = () => {
    const currentIndex = monthOptions.findIndex(m => m.value === filter.monthYear);
    if (currentIndex > 1) {
      onFilterChange({ monthYear: monthOptions[currentIndex - 1].value });
    }
  };

  const hasActiveFilters = 
    filter.monthYear !== 'ALL' ||
    filter.accountId !== 'ALL' ||
    filter.type !== 'ALL' ||
    filter.category !== 'ALL' ||
    filter.searchQuery.trim() !== '';

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-sm backdrop-blur space-y-3">
      
      {/* Top Row: Month Navigator, Search, & View Mode */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        {/* Month Navigator with Next/Prev Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80">
          <button
            onClick={handlePrevMonth}
            title="Bulan Sebelumnya"
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="px-2 text-xs sm:text-sm font-bold text-white min-w-[130px] text-center">
            {getMonthYearLabel(filter.monthYear)}
          </div>

          <button
            onClick={handleNextMonth}
            title="Bulan Berikutnya"
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => onFilterChange({ monthYear: filter.monthYear === 'ALL' ? '2026-07' : 'ALL' })}
            className={`px-2 py-1 text-xs rounded-lg font-medium transition ${
              filter.monthYear === 'ALL' 
                ? 'bg-emerald-500 text-slate-950 font-bold' 
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {filter.monthYear === 'ALL' ? 'Semua Waktu' : 'Tampilkan Semua'}
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            placeholder="Cari transaksi (e.g. bensin, semen, wifi)..."
            className="w-full bg-slate-800/80 text-white placeholder-slate-400 text-xs sm:text-sm rounded-xl pl-9 pr-8 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          />
          {filter.searchQuery && (
            <button
              onClick={() => onFilterChange({ searchQuery: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs p-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* View Toggle: Table vs Analytics */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700 self-end sm:self-auto">
          <button
            onClick={() => onViewChange('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeView === 'table'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Tabel</span>
          </button>
          <button
            onClick={() => onViewChange('analytics')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeView === 'analytics'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Grafik & Analisis</span>
          </button>
        </div>

      </div>

      {/* Bottom Row: Filter Dropdowns & Filter Reset */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs">
        
        <div className="flex items-center gap-1 text-slate-400 font-semibold mr-1">
          <Filter className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Filter:</span>
        </div>

        {/* Jenis Filter */}
        <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
          <button
            onClick={() => onFilterChange({ type: 'ALL' })}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              filter.type === 'ALL' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Semua
          </button>
          <button
            onClick={() => onFilterChange({ type: 'masuk' })}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              filter.type === 'masuk' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-400 hover:text-emerald-300'
            }`}
          >
            Masuk
          </button>
          <button
            onClick={() => onFilterChange({ type: 'keluar' })}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              filter.type === 'keluar' ? 'bg-rose-600 text-white font-bold' : 'text-rose-400 hover:text-rose-300'
            }`}
          >
            Keluar
          </button>
        </div>

        {/* Akun Filter */}
        <div className="relative">
          <select
            aria-label="Filter Akun"
            value={filter.accountId}
            onChange={(e) => onFilterChange({ accountId: e.target.value })}
            className="bg-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 border border-slate-700 hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer text-xs"
          >
            <option value="ALL">Semua Akun / Dompet</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Kategori Filter */}
        <div className="relative">
          <select
            aria-label="Filter Kategori"
            value={filter.category}
            onChange={(e) => onFilterChange({ category: e.target.value })}
            className="bg-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 border border-slate-700 hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer text-xs"
          >
            <option value="ALL">Semua Kategori</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Filter Indicator / Reset */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-slate-400 text-xs font-medium">
            <strong className="text-white">{totalFilteredCount}</strong> transaksi
          </span>

          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-400/40 text-xs font-medium transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

      </div>

    </div>
  );
};
