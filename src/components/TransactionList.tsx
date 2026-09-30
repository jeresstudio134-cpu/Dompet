import React, { useState } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Trash2, 
  Edit3, 
  Copy, 
  ArrowLeftRight, 
  Calendar, 
  Tag, 
  Wallet,
  Sparkles,
  CheckSquare,
  Square,
  MoreVertical
} from 'lucide-react';
import { Transaction, Account } from '../types/finance.ts';
import { formatRupiah, formatTanggalIndo } from '../utils/formatters.ts';

interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  onDuplicate: (tx: Transaction) => void;
  onBatchDelete?: (ids: string[]) => void;
  onOpenAutoRecord: () => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  accounts,
  onEdit,
  onDelete,
  onDuplicate,
  onBatchDelete,
  onOpenAutoRecord,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const getAccount = (id: string) => {
    return accounts.find(a => a.id === id) || { name: id, color: '#64748b' };
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Pokok': return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'Pribadi': return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'Kendaraan': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'Bangun Rumah': return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
      case 'Operasional Toko': return 'bg-teal-500/15 text-teal-300 border-teal-500/30';
      case 'Pemasukan Toko': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'Pindah Saldo': return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
      default: return 'bg-slate-700/50 text-slate-300 border-slate-600';
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === transactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map(t => t.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length > 0 && onBatchDelete) {
      if (confirm(`Hapus ${selectedIds.length} transaksi yang dipilih?`)) {
        onBatchDelete(selectedIds);
        setSelectedIds([]);
      }
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 animate-pulse" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">
          Tidak Ada Transaksi Ditemukan
        </h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
          Tidak ada transaksi yang cocok dengan filter yang Anda pilih. Coba ubah filter atau catat transaksi baru secara otomatis.
        </p>
        <button
          onClick={onOpenAutoRecord}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 transition cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          <span>Mulai Catat Otomatis</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
      
      {/* Table Header Controls (Batch Actions) */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-800/95 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-slate-200">
            <span className="font-bold text-emerald-400">{selectedIds.length}</span>
            <span>transaksi dipilih</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-medium transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Terpilih</span>
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Desktop / Tablet Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[11px] tracking-wider">
              <th className="py-3 px-3 w-10 text-center">
                <button
                  onClick={toggleSelectAll}
                  className="text-slate-400 hover:text-white"
                  title="Pilih Semua"
                >
                  {selectedIds.length === transactions.length && transactions.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <th className="py-3 px-2 w-12 text-center">No</th>
              <th className="py-3 px-3 w-32">Tanggal</th>
              <th className="py-3 px-4">Keterangan</th>
              <th className="py-3 px-3 w-28">Akun</th>
              <th className="py-3 px-3 w-24">Jenis</th>
              <th className="py-3 px-3 w-32">Kategori</th>
              <th className="py-3 px-4 w-36 text-right">Nominal</th>
              <th className="py-3 px-3 w-24 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {transactions.map((tx, idx) => {
              const acc = getAccount(tx.accountId);
              const isSelected = selectedIds.includes(tx.id);
              const isMasuk = tx.type === 'masuk';

              return (
                <tr 
                  key={tx.id} 
                  className={`hover:bg-slate-800/40 transition group ${
                    isSelected ? 'bg-emerald-950/20' : ''
                  }`}
                >
                  {/* Select Checkbox */}
                  <td className="py-3 px-3 text-center">
                    <button
                      onClick={() => toggleSelect(tx.id)}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
                      )}
                    </button>
                  </td>

                  {/* No */}
                  <td className="py-3 px-2 text-center text-slate-500 font-mono text-xs">
                    {tx.no || idx + 1}
                  </td>

                  {/* Tanggal */}
                  <td className="py-3 px-3 text-slate-300 font-medium whitespace-nowrap">
                    {formatTanggalIndo(tx.date)}
                  </td>

                  {/* Keterangan */}
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white group-hover:text-emerald-300 transition">
                      {tx.description}
                    </div>
                    {tx.transferTargetAccountId && (
                      <div className="text-[11px] text-sky-400 flex items-center gap-1 mt-0.5">
                        <ArrowLeftRight className="w-3 h-3" />
                        <span>Transfer ke {getAccount(tx.transferTargetAccountId).name}</span>
                      </div>
                    )}
                    {tx.notes && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {tx.notes}
                      </div>
                    )}
                  </td>

                  {/* Akun */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span 
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border"
                      style={{
                        backgroundColor: `${acc.color}15`,
                        borderColor: `${acc.color}40`,
                        color: acc.color,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: acc.color }} />
                      {acc.name}
                    </span>
                  </td>

                  {/* Jenis (Masuk / Keluar) */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    {isMasuk ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <ArrowUpRight className="w-3 h-3" />
                        Masuk
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <ArrowDownLeft className="w-3 h-3" />
                        Keluar
                      </span>
                    )}
                  </td>

                  {/* Kategori */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-medium border ${getCategoryColor(tx.category)}`}>
                      {tx.category || '-'}
                    </span>
                  </td>

                  {/* Nominal */}
                  <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                    <span className={isMasuk ? 'text-emerald-400 font-extrabold' : 'text-slate-100 font-bold'}>
                      {isMasuk ? '+' : '-'}{formatRupiah(tx.amount)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 transition">
                      <button
                        onClick={() => onDuplicate(tx)}
                        title="Duplikat Transaksi"
                        className="p-1 rounded-md text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onEdit(tx)}
                        title="Edit Transaksi"
                        className="p-1 rounded-md text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(tx.id)}
                        title="Hapus Transaksi"
                        className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-slate-800/80">
        {transactions.map((tx, idx) => {
          const acc = getAccount(tx.accountId);
          const isMasuk = tx.type === 'masuk';
          const isSelected = selectedIds.includes(tx.id);

          return (
            <div 
              key={tx.id}
              className={`p-3.5 space-y-2 transition ${
                isSelected ? 'bg-emerald-950/20' : 'hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggleSelect(tx.id)}
                    className="mt-0.5 text-slate-500"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </button>
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      {tx.description}
                    </h4>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>{formatTanggalIndo(tx.date)}</span>
                      <span className="text-slate-600">•</span>
                      <span>#{tx.no || idx + 1}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`text-sm font-extrabold font-mono block ${
                    isMasuk ? 'text-emerald-400' : 'text-slate-100'
                  }`}>
                    {isMasuk ? '+' : '-'}{formatRupiah(tx.amount)}
                  </span>
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase mt-0.5 ${
                    isMasuk ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {tx.type}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Account Badge */}
                  <span 
                    className="text-[11px] font-semibold px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: `${acc.color}15`,
                      borderColor: `${acc.color}40`,
                      color: acc.color,
                    }}
                  >
                    {acc.name}
                  </span>

                  {/* Category Badge */}
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${getCategoryColor(tx.category)}`}>
                    {tx.category || '-'}
                  </span>
                </div>

                {/* Mobile Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onDuplicate(tx)}
                    className="p-1 rounded text-slate-400 hover:text-sky-300"
                    title="Duplikat"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onEdit(tx)}
                    className="p-1 rounded text-slate-400 hover:text-emerald-300"
                    title="Edit"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(tx.id)}
                    className="p-1 rounded text-slate-400 hover:text-rose-400"
                    title="Hapus"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
