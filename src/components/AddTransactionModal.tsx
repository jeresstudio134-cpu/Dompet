import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  ArrowLeftRight, 
  PlusCircle, 
  Calendar, 
  Tag, 
  Wallet, 
  FileText,
  DollarSign
} from 'lucide-react';
import { Transaction, Account, TransactionType } from '../types/finance.ts';
import { formatRupiah, getCurrentDateIndo, parseRupiahInput } from '../utils/formatters.ts';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (txData: Omit<Transaction, 'id'>, editId?: string) => void;
  onTransfer: (fromAcc: string, toAcc: string, amount: number, date: string, notes: string) => void;
  editTransaction?: Transaction | null;
  accounts: Account[];
  categories: string[];
  initialMode?: 'transaction' | 'transfer';
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onTransfer,
  editTransaction,
  accounts,
  categories,
  initialMode = 'transaction',
}) => {
  const [mode, setMode] = useState<'transaction' | 'transfer'>(initialMode);

  // Form states for normal transaction
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [type, setType] = useState<TransactionType>('keluar');
  const [accountId, setAccountId] = useState(accounts[0]?.id || 'cash');
  const [category, setCategory] = useState(categories[0] || 'Pribadi');
  const [date, setDate] = useState(getCurrentDateIndo());
  const [notes, setNotes] = useState('');

  // Form states for transfer mode
  const [transferFrom, setTransferFrom] = useState(accounts[0]?.id || 'cash');
  const [transferTo, setTransferTo] = useState(accounts[1]?.id || 'dana');
  const [transferAmountStr, setTransferAmountStr] = useState('');
  const [transferDate, setTransferDate] = useState(getCurrentDateIndo());
  const [transferNotes, setTransferNotes] = useState('');

  useEffect(() => {
    if (editTransaction) {
      setMode('transaction');
      setDescription(editTransaction.description);
      setAmountStr(editTransaction.amount.toString());
      setType(editTransaction.type);
      setAccountId(editTransaction.accountId);
      setCategory(editTransaction.category);
      setDate(editTransaction.date);
      setNotes(editTransaction.notes || '');
    } else {
      setMode(initialMode);
      setDescription('');
      setAmountStr('');
      setType('keluar');
      setAccountId(accounts[0]?.id || 'cash');
      setCategory('Pribadi');
      setDate(getCurrentDateIndo());
      setNotes('');
      setTransferAmountStr('');
      setTransferNotes('');
    }
  }, [editTransaction, isOpen, initialMode]);

  if (!isOpen) return null;

  const handleAmountChange = (val: string) => {
    // Keep numbers only
    const num = parseRupiahInput(val);
    setAmountStr(num > 0 ? num.toLocaleString('id-ID') : '');
  };

  const handleTransferAmountChange = (val: string) => {
    const num = parseRupiahInput(val);
    setTransferAmountStr(num > 0 ? num.toLocaleString('id-ID') : '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'transfer') {
      const amount = parseRupiahInput(transferAmountStr);
      if (amount <= 0 || transferFrom === transferTo) return;
      onTransfer(transferFrom, transferTo, amount, transferDate, transferNotes);
      onClose();
      return;
    }

    const amount = parseRupiahInput(amountStr);
    if (!description.trim() || amount <= 0) return;

    onSave(
      {
        description: description.trim(),
        amount,
        type,
        accountId,
        category,
        date,
        notes: notes.trim() || undefined,
      },
      editTransaction?.id
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'transfer' ? (
              <ArrowLeftRight className="w-5 h-5 text-sky-400" />
            ) : (
              <PlusCircle className="w-5 h-5 text-emerald-400" />
            )}
            <h3 className="font-bold text-white text-base">
              {editTransaction 
                ? 'Edit Transaksi' 
                : mode === 'transfer' 
                ? 'Pindah Saldo (Transfer Antar Dompet)' 
                : 'Tambah Transaksi'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher (only for new transactions) */}
        {!editTransaction && (
          <div className="grid grid-cols-2 p-1.5 bg-slate-950/60 m-4 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setMode('transaction')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition ${
                mode === 'transaction' 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Transaksi Biasa
            </button>
            <button
              type="button"
              onClick={() => setMode('transfer')}
              className={`py-1.5 text-xs font-semibold rounded-lg transition ${
                mode === 'transfer' 
                  ? 'bg-sky-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pindah Saldo Antar Akun
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* TRANSFER MODE FORM */}
          {mode === 'transfer' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Dari Akun (Sumber):
                  </label>
                  <select
                    value={transferFrom}
                    onChange={(e) => setTransferFrom(e.target.value)}
                    className="w-full bg-slate-800 text-white rounded-xl p-2.5 text-xs border border-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id} disabled={a.id === transferTo}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Ke Akun (Tujuan):
                  </label>
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    className="w-full bg-slate-800 text-white rounded-xl p-2.5 text-xs border border-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id} disabled={a.id === transferFrom}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Nominal Transfer (Rp):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                    Rp
                  </span>
                  <input
                    type="text"
                    required
                    value={transferAmountStr}
                    onChange={(e) => handleTransferAmountChange(e.target.value)}
                    placeholder="Contoh: 50.000"
                    className="w-full bg-slate-800 text-white font-mono font-bold rounded-xl pl-10 pr-3 py-2.5 text-base border border-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Tanggal:
                </label>
                <input
                  type="date"
                  required
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full bg-slate-800 text-white rounded-xl p-2.5 text-xs border border-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Catatan Tambahan (Opsional):
                </label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="Contoh: Pindah dari TF ke dompet toko"
                  className="w-full bg-slate-800 text-white rounded-xl p-2.5 text-xs border border-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>
          ) : (
            /* NORMAL TRANSACTION FORM */
            <div className="space-y-4">
              
              {/* Type Switcher: Keluar / Masuk */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType('keluar')}
                  className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    type === 'keluar'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Pengeluaran (Keluar)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('masuk')}
                  className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    type === 'masuk'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Pemasukan (Masuk)</span>
                </button>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Keterangan:
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: Bensin, Bakso, Bulanan Wifi, Pemasukan Toko"
                  className="w-full bg-slate-800 text-white rounded-xl p-2.5 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Nominal (Rp):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                    Rp
                  </span>
                  <input
                    type="text"
                    required
                    value={amountStr}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0"
                    className="w-full bg-slate-800 text-white font-mono font-bold rounded-xl pl-10 pr-3 py-2.5 text-base border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Account & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Dompet / Akun:
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full bg-slate-800 text-white rounded-xl p-2.5 text-xs border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Kategori:
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-800 text-white rounded-xl p-2.5 text-xs border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Tanggal Transaksi:
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-800 text-white rounded-xl p-2.5 text-xs border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Catatan Tambahan (Opsional):
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan kecil..."
                  className="w-full bg-slate-800 text-white rounded-xl p-2.5 text-xs border border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition ${
                mode === 'transfer'
                  ? 'bg-sky-600 hover:bg-sky-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{editTransaction ? 'Simpan Perubahan' : 'Simpan Transaksi'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
