import React, { useState, useRef } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  Check, 
  AlertCircle,
  FileJson,
  FileDown,
  TableProperties
} from 'lucide-react';
import { Transaction, Account } from '../types/finance.ts';

interface ExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  filteredTransactions?: Transaction[];
  accounts: Account[];
  onImportTransactions: (imported: Transaction[]) => void;
}

export const ExportImportModal: React.FC<ExportImportModalProps> = ({
  isOpen,
  onClose,
  transactions,
  filteredTransactions,
  accounts,
  onImportTransactions,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importStatus, setImportStatus] = useState<{ message: string; isError?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const exportList = filteredTransactions !== undefined ? filteredTransactions : transactions;
  const isFiltered = filteredTransactions !== undefined && filteredTransactions.length !== transactions.length;

  const HEADERS = ['No', 'Tanggal', 'Keterangan', 'Akun', 'Jenis', 'Kategori', 'Nominal', 'Catatan'];

  // Helper to build native Excel-compatible HTML (.xls)
  const buildExcelXmlHtml = (headers: string[], rows: (string | number)[][], sheetName = 'Transaksi Toko') => {
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${sheetName}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    th { background-color: #1e3a5f; color: #ffffff; font-weight: bold; border: 0.5pt solid #999999; padding: 6px 12px; text-align: center; }
    td { border: 0.5pt solid #cccccc; padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 11pt; }
    .center { text-align: center; }
    .num { text-align: right; mso-number-format:"\\#\\,\\#\\#0"; }
    .text { mso-number-format:"\\@"; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>
        ${headers.map(h => `<th>${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => `
        <tr>
          <td class="center">${r[0]}</td>
          <td class="center text">${r[1]}</td>
          <td>${r[2]}</td>
          <td>${r[3]}</td>
          <td class="center">${r[4]}</td>
          <td>${r[5]}</td>
          <td class="num">${r[6]}</td>
          <td>${r[7] || ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;
  };

  // 1. Export to Excel Native Spreadsheet (.xls) - Opens directly in distinct columns
  const handleExportExcel = () => {
    const rows = exportList.map((t, idx) => {
      const acc = accounts.find(a => a.id === t.accountId)?.name || t.accountId;
      return [
        t.no || idx + 1,
        t.date,
        t.description,
        acc,
        t.type === 'masuk' ? 'Masuk' : 'Keluar',
        t.category || '-',
        t.amount,
        t.notes || '',
      ];
    });

    const excelHtml = buildExcelXmlHtml(HEADERS, rows, 'Buku Kas Toko');
    const blob = new Blob(['\uFEFF' + excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dompet_toko_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 2. Export to CSV with Excel sep=, directive
  const handleExportCSV = () => {
    const rows = exportList.map((t, idx) => {
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

    // sep=,\r\n tells Microsoft Excel to explicitly use comma as delimiter
    const csvContent = 'sep=,\r\n' + [HEADERS.join(','), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `dompet_toko_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Export to JSON
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

  // 4. Download Template Excel (.xls) - DIRECT PER COLUMN IN EXCEL
  const handleDownloadTemplateExcel = () => {
    const sampleRows = [
      [1, '2026-09-30', 'Penjualan Toko (Contoh)', 'Cash', 'Masuk', 'Toko', 150000, 'Pemasukan penjualan tunai'],
      [2, '2026-09-30', 'Beli Perlengkapan Toko', 'Dana', 'Keluar', 'Operasional', 35000, 'Belanja kebutuhan toko'],
      [3, '2026-09-30', 'Pindah Saldo Kas ke Seabank', 'Cash', 'Keluar', 'Pindah Saldo', 100000, 'Contoh transfer'],
    ];

    const excelHtml = buildExcelXmlHtml(HEADERS, sampleRows, 'Template Impor');
    const blob = new Blob(['\uFEFF' + excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `template_import_transaksi_toko.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 5. Download Template CSV (.csv) with sep=,
  const handleDownloadTemplateCSV = () => {
    const sampleRows = [
      ['1', '2026-09-30', 'Penjualan Toko (Contoh)', 'Cash', 'Masuk', 'Toko', '150000', 'Pemasukan penjualan tunai'],
      ['2', '2026-09-30', 'Beli Perlengkapan Toko', 'Dana', 'Keluar', 'Operasional', '35000', 'Belanja kebutuhan toko'],
      ['3', '2026-09-30', 'Pindah Saldo Kas ke Seabank', 'Cash', 'Keluar', 'Pindah Saldo', '100000', 'Contoh transfer'],
    ];

    // sep=,\r\n tells Microsoft Excel to explicitly use comma as delimiter
    const csvContent = 'sep=,\r\n' + [HEADERS.join(','), ...sampleRows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `template_import_transaksi_toko.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV tokenizer that respects quotes and delimiter
  const parseDelimitedLine = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Handle JSON, Excel (.xls), or CSV import
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      try {
        // CASE A: JSON backup
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            onImportTransactions(parsed);
            setImportStatus({ message: `Berhasil mengimpor ${parsed.length} transaksi dari file JSON.` });
          } else if (parsed.transactions && Array.isArray(parsed.transactions)) {
            onImportTransactions(parsed.transactions);
            setImportStatus({ message: `Berhasil mengimpor ${parsed.transactions.length} transaksi dari backup JSON.` });
          }
          return;
        }

        // CASE B: HTML Table / Excel .xls file
        if (content.includes('<table') || content.includes('<tr')) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/html');
          const trs = Array.from(doc.querySelectorAll('tr'));
          const imported: Transaction[] = [];

          trs.forEach((tr, i) => {
            const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim() || '');
            if (tds.length >= 6) {
              const amount = parseInt((tds[6] || tds[5]).replace(/[^0-9]/g, ''), 10) || 0;
              if (amount > 0) {
                imported.push({
                  id: `tx-imp-${Date.now()}-${i}`,
                  no: parseInt(tds[0], 10) || i + 1,
                  date: tds[1] || new Date().toISOString().split('T')[0],
                  description: tds[2] || 'Transaksi',
                  accountId: (tds[3] || 'cash').toLowerCase().replace(/\s+/g, ''),
                  type: (tds[4] || '').toLowerCase().includes('masuk') ? 'masuk' : 'keluar',
                  category: tds[5] || 'Lainnya',
                  amount,
                  notes: tds[7] || undefined,
                });
              }
            }
          });

          if (imported.length > 0) {
            onImportTransactions(imported);
            setImportStatus({ message: `Berhasil mengimpor ${imported.length} transaksi dari file Excel.` });
          } else {
            setImportStatus({ message: 'Tidak ditemukan baris transaksi yang valid di file Excel.', isError: true });
          }
          return;
        }

        // CASE C: CSV File (Auto-detect , or ; or \t)
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
        // Skip sep= directive if present
        const filteredLines = lines[0]?.startsWith('sep=') ? lines.slice(1) : lines;

        if (filteredLines.length <= 1) {
          setImportStatus({ message: 'File CSV kosong atau hanya berisi judul kolom.', isError: true });
          return;
        }

        const headerLine = filteredLines[0];
        let delimiter = ',';
        if (headerLine.includes(';') && headerLine.split(';').length >= headerLine.split(',').length) {
          delimiter = ';';
        } else if (headerLine.includes('\t')) {
          delimiter = '\t';
        }

        const imported: Transaction[] = [];
        for (let i = 1; i < filteredLines.length; i++) {
          const cols = parseDelimitedLine(filteredLines[i], delimiter);
          if (cols.length >= 6) {
            const rawAmount = cols[6] !== undefined && cols[6] !== '' ? cols[6] : cols[5];
            const amount = parseInt(rawAmount.replace(/[^0-9]/g, ''), 10) || 0;
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
          setImportStatus({ message: `Berhasil mengimpor ${imported.length} transaksi dari CSV.` });
        } else {
          setImportStatus({ message: 'Tidak ada data transaksi yang valid dalam file CSV. Pastikan kolom sesuai petunjuk.', isError: true });
        }
      } catch (err: any) {
        console.error('Import error:', err);
        setImportStatus({ message: 'Format file tidak didukung atau isi file rusak.', isError: true });
      }
    };

    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-sm">
                Ekspor & Impor Data Pembukuan
              </h3>
              <p className="text-[10px] text-slate-500">
                Download spreadsheet Excel atau upload data transaksi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-100 bg-slate-50/40 px-5 pt-1.5">
          <button
            onClick={() => { setActiveTab('export'); setImportStatus(null); }}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'export'
                ? 'border-[#1e3a5f] text-[#1e3a5f]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Unduh / Ekspor Data
          </button>
          <button
            onClick={() => { setActiveTab('import'); setImportStatus(null); }}
            className={`pb-2 px-3 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'import'
                ? 'border-[#1e3a5f] text-[#1e3a5f]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Upload / Impor Data
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          
          {activeTab === 'export' ? (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                {isFiltered ? (
                  <>
                    Unduh <strong>{exportList.length}</strong> transaksi hasil filter (dari total {transactions.length} transaksi) ke format Excel atau CSV:
                  </>
                ) : (
                  <>
                    Unduh seluruh <strong>{transactions.length}</strong> riwayat transaksi toko Anda ke format Excel (rapi per kolom) atau file cadangan JSON:
                  </>
                )}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Excel Native .XLS */}
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1e3a5f]/40 text-left transition space-y-2 group cursor-pointer shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition">
                    <TableProperties className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-slate-800 text-xs">Format Excel</h4>
                      <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-bold">Rekomendasi</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Otomatis langsung rapi per kolom di Microsoft Excel.
                    </p>
                  </div>
                </button>

                {/* 2. CSV Format */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1e3a5f]/40 text-left transition space-y-2 group cursor-pointer shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center group-hover:scale-105 transition">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs">Format CSV</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Dengan pemisah koma terstandarisasi.
                    </p>
                  </div>
                </button>

                {/* 3. JSON Backup */}
                <button
                  type="button"
                  onClick={handleExportJSON}
                  className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1e3a5f]/40 text-left transition space-y-2 group cursor-pointer shadow-2xs sm:col-span-2"
                >
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-105 transition">
                    <FileJson className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs">Backup Penuh (.JSON)</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Menyimpan seluruh konfigurasi akun dan transaksi untuk dicadangkan atau dipindahkan.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Template Download Card */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <FileDown className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-950 text-xs">Download Template Excel Siap Pakai</h4>
                    <p className="text-[10px] text-emerald-800">
                      Buka di Microsoft Excel, isi baris transaksi, lalu upload ke sini.
                    </p>
                  </div>
                </div>

                {/* Download Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDownloadTemplateExcel}
                    className="px-3 py-2 rounded-xl bg-[#1b7a4b] hover:bg-[#156a40] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Template Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTemplateCSV}
                    className="px-3 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-900 font-bold text-xs hover:bg-emerald-100/50 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Download Template CSV</span>
                  </button>
                </div>

                <div className="text-[10px] text-slate-600 bg-white p-2.5 rounded-xl border border-emerald-200/80 space-y-1">
                  <p className="font-bold text-emerald-900">Kolom-kolom yang harus diisi:</p>
                  <p>• <strong>No:</strong> Nomor urut (1, 2, 3...)</p>
                  <p>• <strong>Tanggal:</strong> Format YYYY-MM-DD (contoh: 2026-09-30)</p>
                  <p>• <strong>Keterangan:</strong> Nama transaksi (contoh: Penjualan Toko)</p>
                  <p>• <strong>Akun:</strong> Nama akun (Cash, Dana, Seabank, Shopeepay, dll)</p>
                  <p>• <strong>Jenis:</strong> Isi <strong>Masuk</strong> atau <strong>Keluar</strong></p>
                  <p>• <strong>Kategori:</strong> Toko, Operasional, Pribadi, Pokok, dll</p>
                  <p>• <strong>Nominal:</strong> Hanya angka (contoh: <strong>150000</strong>, tanpa titik atau Rp)</p>
                  <p>• <strong>Catatan:</strong> Keterangan tambahan (opsional)</p>
                </div>
              </div>

              {/* Upload Box */}
              <div className="border-2 border-dashed border-slate-300 hover:border-[#1e3a5f] rounded-2xl p-5 text-center transition bg-slate-50/50">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.xls,.json"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer space-y-2"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#1e3a5f]/10 text-[#1e3a5f] mx-auto flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="font-bold text-slate-800 text-xs sm:text-sm">
                    Pilih File Excel (.xls) atau CSV (.csv)
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Klik di sini untuk mengunggah file yang sudah Anda isi di Excel.
                  </p>
                </div>
              </div>

              {/* Tips for existing opened file */}
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  💡 Tips untuk file CSV yang sudah terlanjur terbuka di Excel Anda:
                </p>
                <p className="text-amber-800 text-[10px] leading-relaxed">
                  Pilih Kolom A → Klik tab <strong>Data</strong> di menu atas Excel → Klik <strong>Text to Columns</strong> (Teks ke Kolom) → Pilih <strong>Delimited</strong> → Centang <strong>Comma</strong> (Koma) → Klik <strong>Finish</strong>. Data Anda akan langsung terbagi rapi ke kolom B, C, D, E, F, G, H!
                </p>
              </div>

              {importStatus && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  importStatus.isError 
                    ? 'bg-rose-50 border-rose-200 text-rose-700' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                  {importStatus.isError ? (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  ) : (
                    <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  )}
                  <span>{importStatus.message}</span>
                </div>
              )}
            </div>
          )}

        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end bg-slate-50/80">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
