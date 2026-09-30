import React, { useState, useRef } from 'react';
import { 
  Sparkles, 
  X, 
  Camera, 
  Upload, 
  Check, 
  AlertCircle, 
  ArrowRight, 
  FileText, 
  Flame, 
  RefreshCw,
  Plus
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Account, Transaction } from '../types/finance.ts';
import { parseSmartSentence, parseMultiLineText, ParsedTransactionResult } from '../lib/autoParser.ts';
import { parseReceiptWithGemini } from '../lib/aiParser.ts';
import { formatRupiah, getCurrentDateIndo } from '../utils/formatters.ts';

interface AutoRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTransactions: (transactions: Omit<Transaction, 'id'>[]) => void;
  accounts: Account[];
  categories: string[];
}

export const AutoRecordModal: React.FC<AutoRecordModalProps> = ({
  isOpen,
  onClose,
  onAddTransactions,
  accounts,
  categories,
}) => {
  const [activeTab, setActiveTab] = useState<'smart' | 'multi' | 'receipt'>('smart');
  
  // Smart single sentence
  const [smartInput, setSmartInput] = useState('');
  const [parsedSingle, setParsedSingle] = useState<ParsedTransactionResult | null>(null);

  // Multi line / paste
  const [multiInput, setMultiInput] = useState('');
  const [parsedList, setParsedList] = useState<ParsedTransactionResult[]>([]);

  // Receipt image scan
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle single smart text change
  const handleSmartInputChange = (val: string) => {
    setSmartInput(val);
    if (val.trim().length > 3) {
      const res = parseSmartSentence(val);
      setParsedSingle(res);
    } else {
      setParsedSingle(null);
    }
  };

  // Handle multi-line paste parse
  const handleMultiParse = () => {
    if (!multiInput.trim()) return;
    const res = parseMultiLineText(multiInput);
    setParsedList(res);
  };

  // Quick preset chips
  const applyPreset = (text: string) => {
    setSmartInput(text);
    const res = parseSmartSentence(text);
    setParsedSingle(res);
  };

  // Submit single transaction
  const handleSaveSingle = () => {
    if (!parsedSingle || parsedSingle.amount <= 0) return;

    // Check if it's transfer
    if (parsedSingle.category === 'Pindah Saldo' && parsedSingle.transferTargetAccountId) {
      // Create transfer pair:
      const fromAcc = parsedSingle.accountId;
      const toAcc = parsedSingle.transferTargetAccountId;
      const amount = parsedSingle.amount;
      const date = parsedSingle.date;

      onAddTransactions([
        {
          date,
          description: `Pindah ke ${accounts.find(a => a.id === toAcc)?.name || toAcc}`,
          accountId: fromAcc,
          type: 'keluar',
          category: 'Pindah Saldo',
          amount,
          transferTargetAccountId: toAcc,
        },
        {
          date,
          description: `Pindah dari ${accounts.find(a => a.id === fromAcc)?.name || fromAcc}`,
          accountId: toAcc,
          type: 'masuk',
          category: 'Pindah Saldo',
          amount,
        }
      ]);
    } else {
      onAddTransactions([
        {
          date: parsedSingle.date,
          description: parsedSingle.description,
          accountId: parsedSingle.accountId,
          type: parsedSingle.type,
          category: parsedSingle.category,
          amount: parsedSingle.amount,
        }
      ]);
    }

    confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
    onClose();
    setSmartInput('');
    setParsedSingle(null);
  };

  // Submit multi transactions
  const handleSaveMulti = () => {
    if (parsedList.length === 0) return;

    const toSave: Omit<Transaction, 'id'>[] = parsedList.map(p => ({
      date: p.date,
      description: p.description,
      accountId: p.accountId,
      type: p.type,
      category: p.category,
      amount: p.amount,
      transferTargetAccountId: p.transferTargetAccountId,
    }));

    onAddTransactions(toSave);
    confetti({ particleCount: 50, spread: 70, origin: { y: 0.7 } });
    onClose();
    setMultiInput('');
    setParsedList([]);
  };

  // Receipt image file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setReceiptImage(base64);
      setScanError(null);
      setIsScanning(true);

      try {
        const results = await parseReceiptWithGemini(base64, file.type || 'image/jpeg');
        setParsedList(results);
      } catch (err: any) {
        console.error('Scan failed:', err);
        setScanError(err.message || 'Gagal memindai struk. Coba gunakan foto yang lebih terang atau ketik langsung di tab Teks Cerdas.');
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Pencatatan Keuangan Otomatis
              </h2>
              <p className="text-xs text-slate-400">
                Deteksi otomatis nominal, kategori, akun, dan tanggal dari teks atau struk
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('smart')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition ${
              activeTab === 'smart'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚡ Kalimat / SMS Otomatis
          </button>
          <button
            onClick={() => setActiveTab('multi')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition ${
              activeTab === 'multi'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 Paste Banyak Baris / Excel
          </button>
          <button
            onClick={() => setActiveTab('receipt')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition ${
              activeTab === 'receipt'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📷 Foto Nota / Struk (AI)
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* TAB 1: SMART SINGLE SENTENCE */}
          {activeTab === 'smart' && (
            <div className="space-y-4">
              
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Ketik apa saja secara santai atau paste notifikasi SMS/M-Banking:
                </label>
                <div className="relative">
                  <textarea
                    rows={2}
                    value={smartInput}
                    onChange={(e) => handleSmartInputChange(e.target.value)}
                    placeholder="Contoh: beli bensin 30rb seabank kendaraan, atau: makan bakso 15rb cash"
                    className="w-full bg-slate-800/90 text-white placeholder-slate-500 text-sm rounded-xl p-3 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
                  />
                  {smartInput && (
                    <button
                      onClick={() => handleSmartInputChange('')}
                      className="absolute right-3 top-3 text-slate-400 hover:text-white text-xs"
                    >
                      Bersihkan
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  Shortcut Cepat (Klik untuk langsung isi):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'bensin 30rb cash kendaraan',
                    'bensin 20rb cash kendaraan',
                    'bakso 15rb cash pribadi',
                    'bulanan wifi 125rb seabank pokok',
                    'listrik 83rb seabank pokok',
                    'semen 90rb cash bangun rumah',
                    'pemasukan toko 250rb ke dana',
                    'pemasukan toko 150rb cash',
                    'pindah 50rb dari seabank ke cash',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 border border-slate-700/80 transition"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Detection Preview Card */}
              {parsedSingle && (
                <div className="bg-slate-800/90 rounded-2xl border border-emerald-500/40 p-4 shadow-md space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Hasil Ekstraksi Cerdas
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      Akurasi: {Math.round(parsedSingle.confidence * 100)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                      <span className="text-[10px] text-slate-400 block">Keterangan:</span>
                      <span className="text-xs font-bold text-white truncate block">
                        {parsedSingle.description || '-'}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                      <span className="text-[10px] text-slate-400 block">Nominal:</span>
                      <span className={`text-xs font-black font-mono block ${
                        parsedSingle.type === 'masuk' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {formatRupiah(parsedSingle.amount)}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                      <span className="text-[10px] text-slate-400 block">Dompet / Akun:</span>
                      <span className="text-xs font-bold text-sky-400 uppercase block">
                        {accounts.find(a => a.id === parsedSingle.accountId)?.name || parsedSingle.accountId}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                      <span className="text-[10px] text-slate-400 block">Kategori & Jenis:</span>
                      <span className="text-xs font-bold text-amber-300 block truncate">
                        {parsedSingle.category} ({parsedSingle.type})
                      </span>
                    </div>
                  </div>

                  {parsedSingle.transferTargetAccountId && (
                    <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-2.5 text-xs text-sky-300">
                      💡 Terdeteksi sebagai <strong>Transfer Antar Akun</strong>: Saldo akan dipindahkan dari{' '}
                      <strong>{accounts.find(a => a.id === parsedSingle.accountId)?.name}</strong> ke{' '}
                      <strong>{accounts.find(a => a.id === parsedSingle.transferTargetAccountId)?.name}</strong>.
                    </div>
                  )}

                  <button
                    onClick={handleSaveSingle}
                    disabled={parsedSingle.amount <= 0}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Simpan Transaksi Ini</span>
                  </button>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: MULTI LINE PASTE */}
          {activeTab === 'multi' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Paste baris catatan dari Excel, WhatsApp, atau Catatan (satu baris per transaksi):
                </label>
                <textarea
                  rows={4}
                  value={multiInput}
                  onChange={(e) => setMultiInput(e.target.value)}
                  placeholder={`Contoh copy-paste dari Excel:\n10 Juli 2026\tBulanan Wifi\tSeabank\tKeluar\tPokok\t125.000\n10 Juli 2026\tPemasukan Toko\tDana\tMasuk\t-\t41.000\n13 Juli 2026\tBakso\tCash\tKeluar\tPribadi\t5.000`}
                  className="w-full bg-slate-800/90 text-white placeholder-slate-500 text-xs sm:text-sm font-mono rounded-xl p-3 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleMultiParse}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Analisis & Ekstrak ({multiInput.split('\n').filter(Boolean).length} baris)</span>
                </button>
              </div>

              {parsedList.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-bold text-emerald-400">
                      Berhasil Menemukan {parsedList.length} Transaksi:
                    </span>
                    <span>Total: {formatRupiah(parsedList.reduce((sum, item) => sum + item.amount, 0))}</span>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {parsedList.map((item, idx) => (
                      <div key={idx} className="bg-slate-800/70 p-2.5 rounded-xl border border-slate-700/60 flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <span className="font-semibold text-white block truncate">{item.description}</span>
                          <span className="text-[11px] text-slate-400">{item.date} • {item.accountId} • {item.category}</span>
                        </div>
                        <span className={`font-mono font-bold whitespace-nowrap ${
                          item.type === 'masuk' ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {item.type === 'masuk' ? '+' : '-'}{formatRupiah(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSaveMulti}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Simpan Semua ({parsedList.length} Transaksi)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RECEIPT OCR WITH GEMINI */}
          {activeTab === 'receipt' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-2xl p-6 text-center transition bg-slate-950/40">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {receiptImage ? (
                  <div className="space-y-3">
                    <img 
                      src={receiptImage} 
                      alt="Struk Belanja" 
                      className="max-h-48 mx-auto rounded-xl shadow-lg border border-slate-700" 
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-emerald-400 underline hover:text-emerald-300"
                    >
                      Pilih Foto Struk Lain
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer space-y-2"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="font-semibold text-white text-sm">
                      Upload atau Ambil Foto Struk / Nota
                    </div>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      AI Gemini akan membaca nominal, barang, dan rincian struk secara otomatis.
                    </p>
                  </div>
                )}
              </div>

              {isScanning && (
                <div className="py-4 text-center space-y-2">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-emerald-400 font-semibold animate-pulse">
                    AI sedang menganalisis foto struk...
                  </p>
                </div>
              )}

              {scanError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{scanError}</span>
                </div>
              )}

              {parsedList.length > 0 && activeTab === 'receipt' && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-emerald-400">
                    Ditemukan {parsedList.length} Item Pengeluaran dari Struk:
                  </span>
                  <div className="max-h-44 overflow-y-auto space-y-1.5">
                    {parsedList.map((item, idx) => (
                      <div key={idx} className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-white block">{item.description}</span>
                          <span className="text-[11px] text-slate-400">{item.category} • {item.accountId}</span>
                        </div>
                        <span className="font-mono font-bold text-rose-400">
                          {formatRupiah(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSaveMulti}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 text-white font-bold text-sm shadow-md transition"
                  >
                    Simpan Hasil Scan ke Buku Kas
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
