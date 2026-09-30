import React from 'react';
import { 
  Wallet, 
  Sparkles, 
  Plus, 
  ArrowLeftRight, 
  Database, 
  Download, 
  Calendar,
  CheckCircle2,
  CloudOff
} from 'lucide-react';
import { NeonConfig } from '../types/finance.ts';

interface NavbarProps {
  monthYear: string;
  onMonthYearChange: (my: string) => void;
  monthOptions: { value: string; label: string }[];
  neonConfig: NeonConfig;
  onOpenAutoRecord: () => void;
  onOpenAddModal: () => void;
  onOpenTransferModal: () => void;
  onOpenNeonModal: () => void;
  onOpenExportImport: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  monthYear,
  onMonthYearChange,
  monthOptions,
  neonConfig,
  onOpenAutoRecord,
  onOpenAddModal,
  onOpenTransferModal,
  onOpenNeonModal,
  onOpenExportImport,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white truncate">DOMPET TOKO</span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                  Otomatis
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate hidden md:block">
                Pencatatan Keuangan Pribadi & Toko
              </p>
            </div>
          </div>

          {/* Quick Period Selector */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Calendar className="w-4 h-4 text-emerald-400 absolute left-3 pointer-events-none" />
              <select
                aria-label="Pilih Periode Bulan"
                value={monthYear}
                onChange={(e) => onMonthYearChange(e.target.value)}
                className="bg-slate-800/90 text-slate-100 text-xs sm:text-sm rounded-lg pl-9 pr-8 py-2 border border-slate-700 hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer transition font-medium"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-800 text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Neon Postgres Status Pill */}
            <button
              onClick={onOpenNeonModal}
              title={neonConfig.isConnected ? 'Terhubung ke Neon PostgreSQL' : 'Mode Offline / Klik untuk Hubungkan Neon'}
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                neonConfig.isConnected
                  ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {neonConfig.isConnected ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Neon DB Aktif</span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Setup Neon & Vercel</span>
                </>
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            
            {/* Auto Record - Primary Smart Action */}
            <button
              onClick={onOpenAutoRecord}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-md shadow-emerald-600/30 transition transform active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-emerald-100 animate-pulse" />
              <span className="hidden xs:inline">Catat Otomatis</span>
              <span className="xs:hidden">Otomatis</span>
            </button>

            {/* Transfer Antar Akun */}
            <button
              onClick={onOpenTransferModal}
              title="Pindah Saldo Antar Akun"
              className="p-2 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1.5"
            >
              <ArrowLeftRight className="w-4 h-4 text-sky-400" />
              <span className="hidden md:inline">Pindah Saldo</span>
            </button>

            {/* Manual Add */}
            <button
              onClick={onOpenAddModal}
              title="Tambah Transaksi Manual"
              className="p-2 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Manual</span>
            </button>

            {/* Neon & Vercel / Export Icons */}
            <button
              onClick={onOpenNeonModal}
              title="Konfigurasi Database Neon & Deploy Vercel"
              className="p-2 rounded-lg text-slate-400 hover:text-cyan-400 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition"
            >
              <Database className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenExportImport}
              title="Ekspor / Impor Data (Excel / CSV / Backup)"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition"
            >
              <Download className="w-4 h-4" />
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
