import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Camera, Check, AlertCircle, Trash2, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { formatRupiah } from '../utils/formatters.ts';

interface ParsedPayment {
  date: string;
  amount: number;
  notes?: string;
}

interface ParsedDebt {
  type: 'utang' | 'piutang';
  name: string;
  counterparty: string;
  totalAmount: number;
  startDate: string;
  dueDate?: string;
  installmentAmount?: number;
  installmentPeriod?: number;
  notes?: string;
  payments?: ParsedPayment[];
}

interface AutoDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDebts: (items: Omit<ParsedDebt, 'id'>[]) => Promise<void>;
}

type Item = ParsedDebt & { key: string };

const inputCls =
  'w-full bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500';

export const AutoDebtModal: React.FC<AutoDebtModalProps> = ({
  isOpen,
  onClose,
  onAddDebts,
}) => {
  const [activeTab, setActiveTab] = useState<'text' | 'receipt'>('text');
  const [textInput, setTextInput] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    if (!isOpen || activeTab !== 'receipt') return;
    const onPaste = (e: ClipboardEvent) => {
      if (isLoading) return;
      const clipItems = e.clipboardData?.items;
      if (!clipItems) return;
      for (const item of Array.from(clipItems)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [isOpen, activeTab, isLoading]);

  if (!isOpen) return null;

  const withKeys = (list: ParsedDebt[]): Item[] =>
    list.map(it => ({ ...it, key: `i${keyRef.current++}` }));

  const resetAll = () => {
    setTextInput('');
    setItems([]);
    setReceiptImage(null);
    setError(null);
    setNotice(null);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const switchTab = (tab: 'text' | 'receipt') => {
    setActiveTab(tab);
    setItems([]);
    setError(null);
    setNotice(null);
  };

  const updateItem = (key: string, patch: Partial<ParsedDebt>) => {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));
  };

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key));
  };

  const isItemValid = (it: Item) =>
    it.name.trim().length > 0 && it.totalAmount > 0;

  const allValid = items.length > 0 && items.every(isItemValid);

  const handleAnalyze = async () => {
    if (!textInput.trim()) return;
    setIsLoading(true);
    setError(null);
    setNotice(null);
    setItems([]);
    try {
      const res = await fetch('/api/ai-parse-debt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal menganalisis teks.');
      }
      if ((json.debts || []).length === 0) {
        setNotice('AI tidak menemukan data utang/piutang pada teks ini.');
      }
      setItems(withKeys(json.debts || []));
    } catch (err: any) {
      setError(err.message || 'Gagal menganalisis.');
    } finally {
      setIsLoading(false);
    }
  };

  const processFile = async (file: File) => {
    setError(null);
    setNotice(null);
    setItems([]);
    setIsLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setReceiptImage(dataUrl);
      const base64 = dataUrl.split(',')[1];

      const res = await fetch('/api/ai-parse-debt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type || 'image/jpeg',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal menganalisis gambar.');
      }
      if ((json.debts || []).length === 0) {
        setNotice('Tidak ada utang/piutang yang terbaca dari foto.');
      }
      setItems(withKeys(json.debts || []));
    } catch (err: any) {
      setError(err.message || 'Gagal memindai gambar.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) processFile(file);
  };

  const handleSave = async () => {
    if (!allValid) return;
    setIsSaving(true);
    try {
      const toSave = items.map(({ key, ...rest }) => rest);
      await onAddDebts(toSave);
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
      handleClose();
    } finally {
      setIsSaving(false);
    }
  };

  const totalUtang = items.filter(i => i.type === 'utang').reduce((s, i) => s + i.totalAmount, 0);
  const totalPiutang = items.filter(i => i.type === 'piutang').reduce((s, i) => s + i.totalAmount, 0);

  const renderItems = () => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-300">
          <span className="font-bold text-emerald-400">Ditemukan {items.length} item</span>
          <span>
            Utang {formatRupiah(totalUtang)} • Piutang {formatRupiah(totalPiutang)}
          </span>
        </div>

        <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-1">
          {items.map(it => {
            const valid = isItemValid(it);
            const paymentCount = it.payments?.length || 0;
            const paymentTotal = (it.payments || []).reduce((s, p) => s + p.amount, 0);

            return (
              <div
                key={it.key}
                className={`rounded-xl border p-2.5 space-y-2 ${
                  valid ? 'bg-slate-800/70 border-slate-700/60' : 'bg-rose-950/30 border-rose-500/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <select
                    value={it.type}
                    onChange={e => updateItem(it.key, { type: e.target.value as 'utang' | 'piutang' })}
                    className={`${inputCls} font-bold`}
                  >
                    <option value="utang">🔻 UTANG</option>
                    <option value="piutang">🔺 PIUTANG</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    title="Hapus baris"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={it.name}
                    onChange={e => updateItem(it.key, { name: e.target.value })}
                    placeholder="Nama utang"
                    className={inputCls}
                  />
                  <input
                    type="text"
                    value={it.counterparty}
                    onChange={e => updateItem(it.key, { counterparty: e.target.value })}
                    placeholder="Pihak"
                    className={inputCls}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={it.totalAmount ? it.totalAmount.toLocaleString('id-ID') : ''}
                    onChange={e =>
                      updateItem(it.key, {
                        totalAmount: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0,
                      })
                    }
                    placeholder="Total"
                    className={`${inputCls} font-mono font-bold`}
                  />
                  <input
                    type="date"
                    value={it.startDate}
                    onChange={e => updateItem(it.key, { startDate: e.target.value })}
                    className={inputCls}
                  />
                  <input
                    type="date"
                    value={it.dueDate || ''}
                    onChange={e => updateItem(it.key, { dueDate: e.target.value || undefined })}
                    className={inputCls}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={it.installmentAmount ? it.installmentAmount.toLocaleString('id-ID') : ''}
                    onChange={e =>
                      updateItem(it.key, {
                        installmentAmount: parseInt(e.target.value.replace(/\D/g, ''), 10) || undefined,
                      })
                    }
                    placeholder="Cicilan / bulan"
                    className={`${inputCls} font-mono`}
                  />

                  {paymentCount > 0 && (
                    <div className="col-span-2 bg-emerald-950/30 border border-emerald-800/60 rounded-lg px-2.5 py-1.5 text-[11px] text-emerald-300 flex items-center justify-between">
                      <span>
                        💰 Terdeteksi <b>{paymentCount}</b> angsuran sudah dibayar
                      </span>
                      <span className="font-mono font-bold">
                        {formatRupiah(paymentTotal)}
                      </span>
                    </div>
                  )}

                  {paymentCount > 0 && (
                    <details className="col-span-2 bg-slate-900/60 border border-slate-700 rounded-lg">
                      <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:text-white">
                        Lihat {paymentCount} angsuran
                      </summary>
                      <div className="px-2.5 py-2 space-y-1 max-h-40 overflow-y-auto">
                        {it.payments!.map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-[10px] text-slate-400 gap-2">
                            <span className="truncate">
                              {p.date} • {p.notes || `Angsuran ${i + 1}`}
                            </span>
                            <span className="font-mono text-emerald-400 shrink-0">
                              {formatRupiah(p.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!allValid && (
          <p className="text-[11px] text-rose-300">
            Lengkapi baris bertanda merah (nama & total) sebelum menyimpan.
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={!allValid || isSaving}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 text-white font-bold text-sm shadow-md transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          <span>{isSaving ? 'Menyimpan...' : `Simpan ${items.length} Item`}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Pencatatan Utang/Piutang Otomatis</h2>
              <p className="text-xs text-slate-400">
                AI membaca nama, nominal, jatuh tempo, dan riwayat angsuran dari teks atau foto
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2">
          <button
            onClick={() => switchTab('text')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'text'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 Teks / Paste Banyak Baris
          </button>
          <button
            onClick={() => switchTab('receipt')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'receipt'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📷 Foto Nota / Struk (AI)
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'text' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Ketik atau paste dari WhatsApp / Catatan (satu utang per baris):
              </label>
              <textarea
                rows={5}
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder={`Contoh:
utang motor 5jt ke dealer honda cicilan 500rb 12 bulan
piutang ali 1jt jatuh tempo 31 des 2026
utang abah 30jt untuk tanah`}
                className="w-full bg-slate-800/90 text-white placeholder-slate-500 text-xs sm:text-sm font-mono rounded-xl p-3 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!textInput.trim() || isLoading}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Menganalisis...' : 'Analisis dengan AI'}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'receipt' && (
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
                    alt="Nota Utang"
                    className="max-h-48 mx-auto rounded-xl shadow-lg border border-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-emerald-400 underline hover:text-emerald-300 cursor-pointer"
                  >
                    Pilih Foto Lain
                  </button>
                </div>
              ) : (
                <div onClick={() => fileInputRef.current?.click()} className="cursor-pointer space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="font-semibold text-white text-sm">
                    Upload atau Ambil Foto Nota / Struk
                  </div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    AI akan membaca total, pihak, jatuh tempo, dan riwayat angsuran dari gambar.
                  </p>
                </div>
              )}
            </div>
          )}

          {isLoading && activeTab === 'receipt' && (
            <div className="py-3 text-center space-y-2">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-emerald-400 font-semibold animate-pulse">
                AI sedang menganalisis foto...
              </p>
            </div>
          )}

          {notice && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {renderItems()}
        </div>
      </div>
    </div>
  );
};