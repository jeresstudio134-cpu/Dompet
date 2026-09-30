import React, { useState, useRef } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  Database, 
  Check, 
  AlertCircle,
  FileJson,
  FileDown
} from 'lucide-react';
import { Transaction, Account } from '../types/finance.ts';
import { formatTanggalIndo } from '../utils/formatters.ts';

interface ExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  accounts: Account[];
  onImportTransactions: (imported: Transaction[]) => void;
}

export const ExportImportModal: React.FC<ExportImportModalProps> = ({
  isOpen,
  onClose,
  transactions,
  accounts,
  onImportTransactions,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Export to CSV matching Excel DOMPET TOKO format
  const handleExportCSV = () => {
    const headers = ['No', 'Tanggal', 'Keterangan', 'Akun', 'Jenis', 'Kategori', 'Nominal', 'Catatan'];
    const rows = transactions.map((t, idx) => {
      const acc = accounts.find(a => a.id === t.accountId)?.name || t.accountId;
      return [
        t.no || idx + 1,
        t.date,
        `"${t.description.replace(/"/g, '""')}"`,
        `"${acc}"`,
        t.type === 'masuk' ? 'Masuk' : 'Keluar',
        `"${t.category || '-'}"`,
        t.amount,
        `"${(t.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dompet_toko_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to JSON
  const handleExportJSON = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      accounts,
      transactions,
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const link = document.createElement('a');
    link.href = jsonString;
    link.setAttribute('download', `dompet_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download CSV template for import
  const handleDownloadTemplate = () => {
    const headers = ['No', 'Tanggal', 'Keterangan', 'Akun', 'Jenis', 'Kategori', 'Nominal', 'Catatan'];
    const sampleRows = [
      ['1', '2026-09-30', 'Penjualan Toko (Contoh)', 'Cash', 'Masuk', 'Toko', '150000', 'Pemasukan penjualan tunai'],
      ['2', '2026-09-30', 'Beli Perlengkapan Toko', 'Dana', 'Keluar', 'Operasional', '35000', 'Belanja kebutuhan toko'],
      ['3', '2026-09-30', 'Pindah Saldo Kas ke Seabank', 'Cash', 'Keluar', 'Pindah Saldo', '100000', 'Contoh transfer'],
    ];

    const csvContent = [headers.join(','), ...sampleRows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `template_import_transaksi_toko.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle JSON or CSV import
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      try {
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            onImportTransactions(parsed);
            setImportStatus(`Berhasil mengimpor ${parsed.length} transaksi dari file JSON.`);
          } else if (parsed.transactions && Array.isArray(parsed.transactions)) {
            onImportTransactions(parsed.transactions);
            setImportStatus(`Berhasil mengimpor ${parsed.transactions.length} transaksi dari backup JSON.`);
          }
        } else {
          // Simple CSV parser
          const lines = content.split('\n').filter(Boolean);
          const imported: Transaction[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            if (cols.length >= 6) {
              const amount = parseInt(cols[6] || cols[5], 10) || 0;
              if (amount > 0) {
                imported.push({
                  id: `tx-imp-${Date.now()}-${i}`,
                  no: parseInt(cols[0], 10) || i,
                  date: cols[1],
                  description: cols[2] || 'Transaksi',
                  accountId: (cols[3] || 'cash').toLowerCase().replace(/\s+/g, ''),
                  type: (cols[4] || '').toLowerCase().includes('masuk') ? 'masuk' : 'keluar',
                  category: cols[5] || 'Lainnya',
                  amount,
                  notes: cols[7] || undefined,
                });
              }
            }
          }
          if (imported.length > 0) {
            onImportTransactions(imported);
            setImportStatus(`Berhasil mengimpor ${imported.length} transaksi dari CSV.`);
          } else {
            setImportStatus('Tidak ada data transaksi yang valid dalam file CSV.');
          }
        }
      } catch (err: any) {
        console.error('Import error:', err);
        setImportStatus('Format file tidak didukung atau rusak.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-base">
              Ekspor & Impor Data Transaksi
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('export')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'export'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Unduh / Ekspor Data
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'import'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Pulihkan / Impor Data
          </button>
        </div>

        <div className="p-6 space-y-4">
          
          {activeTab === 'export' ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-300">
                Unduh semua <strong>{transactions.length}</strong> transaksi ke format spreadsheet Excel (CSV) atau file cadangan lengkap JSON:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleExportCSV}
                  className="p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/40 text-left transition space-y-2 group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-xs">Format Excel (.CSV)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Sesuai format tabel DOMPET TOKO.
                    </p>
                  </div>
                </button>

                <button
                  onClick={handleExportJSON}
                  className="p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-sky-500/40 text-left transition space-y-2 group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center group-hover:scale-105 transition">
                    <FileJson className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-xs">Backup Lengkap (.JSON)</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Mencakup akun dan seluruh histori.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Template Download Card */}
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <FileDown className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs">Template Impor Data Excel</h4>
                      <p className="text-[11px] text-emerald-300">Format kolom resmi agar data terbaca 100% tepat tanpa error</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Template (.CSV)</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-300 bg-slate-900/70 p-2.5 rounded-xl border border-slate-800 space-y-1">
                  <p className="font-semibold text-emerald-300">Petunjuk Pengisian Kolom:</p>
                  <p>• <strong>Tanggal:</strong> Format YYYY-MM-DD (contoh: 2026-09-30)</p>
                  <p>• <strong>Jenis:</strong> Isi "Masuk" atau "Keluar"</p>
                  <p>• <strong>Akun:</strong> Isi Cash, Dana, Seabank, atau Shopeepay</p>
                  <p>• <strong>Nominal:</strong> Hanya angka (contoh: 150000, tanpa titik atau Rp)</p>
                </div>
              </div>

              {/* Upload Box */}
              <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-2xl p-6 text-center transition bg-slate-950/40">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.json"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer space-y-2"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="font-semibold text-white text-xs sm:text-sm">
                    Pilih File CSV yang Telah Diisi atau Backup JSON
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Klik di sini untuk memilih dan mengimpor file ke pembukuan toko.
                  </p>
                </div>
              </div>

              {importStatus && (
                <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-xs text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{importStatus}</span>
                </div>
              )}
            </div>
          )}

        </div>

        <div className="px-6 py-3 border-t border-slate-800 flex justify-end bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
