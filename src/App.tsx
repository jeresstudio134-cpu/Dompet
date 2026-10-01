/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { 
  INITIAL_ACCOUNTS, 
  INITIAL_CATEGORIES 
} from './data/initialData.ts';
import { 
  Transaction, 
  Account, 
  FilterState, 
  MonthlyStats, 
  NeonConfig 
} from './types/finance.ts';
import { 
  getMonthYearOptions, 
  getCurrentDateIndo,
  formatRupiah 
} from './utils/formatters.ts';
import { getSavedNeonConfig, saveNeonConfig } from './lib/neon.ts';
import {
  apiLoadAll,
  apiSaveTransaction,
  apiSaveTransactions,
  apiDeleteTransaction,
  apiSaveAccount,
  apiDeleteAccount,
  apiAddCategory,
  apiDeleteCategory,
  apiSaveSetting,
  getAdminToken,
  clearAdminToken
} from './lib/api.ts';

// Components
import { DompetTokoView } from './components/DompetTokoView.tsx';
import { AutoRecordModal } from './components/AutoRecordModal.tsx';
import { AddTransactionModal } from './components/AddTransactionModal.tsx';
import { NeonVercelModal } from './components/NeonVercelModal.tsx';
import { ExportImportModal } from './components/ExportImportModal.tsx';
import { AdminPinModal } from './components/AdminPinModal.tsx';

export default function App() {
    // 1. Core State: semua data bersumber dari database (lewat /api/transactions)
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [storeName, setStoreName] = useState<string>('Dompet Toko');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleUpdateStoreName = async (newName: string): Promise<boolean> => {
    const trimmed = newName.trim() || 'Dompet Toko';
    try {
      await apiSaveSetting('store_name', trimmed);
      setStoreName(trimmed);
      showToast(`Nama toko berhasil diubah menjadi "${trimmed}"!`, 'success');
      return true;
    } catch (e) {
      console.error(e);
      showToast('Gagal menyimpan nama toko. Periksa koneksi lalu coba lagi.', 'error');
      return false;
    }
  };

  // Dynamic Categories (stored in localStorage, excluding 'Lainnya' / 'lainya')
  const isExcludedCategory = (name?: string) => {
    if (!name) return true;
    const lower = name.trim().toLowerCase();
    return lower === '' || lower === '-' || lower === 'lainnya' || lower === 'lainya' || lower === 'lain-lain' || lower === 'lain nya';
  };

    const [categories, setCategories] = useState<string[]>([]);

  const handleAddCategory = async (newCat: string) => {
    const trimmed = newCat.trim();
    if (!trimmed || isExcludedCategory(trimmed)) return;
    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) return;
    try {
      await apiAddCategory(trimmed);
      setCategories(prev => [...prev, trimmed]);
      showToast(`Kategori baru "${trimmed}" berhasil ditambahkan!`);
    } catch (e) {
      console.error(e);
      showToast('Gagal menambah kategori. Periksa koneksi lalu coba lagi.', 'error');
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    try {
      await apiDeleteCategory(catToDelete);
      setCategories(prev => prev.filter(c => c !== catToDelete));
      // Kosongkan kategori ini dari transaksi lama (di database sudah dilakukan server)
      setTransactions(prev => prev.map(t => (t.category === catToDelete ? { ...t, category: '' } : t)));
      showToast(`Kategori "${catToDelete}" telah dihapus.`, 'info');
    } catch (e) {
      console.error(e);
      showToast('Gagal menghapus kategori. Periksa koneksi lalu coba lagi.', 'error');
    }
  };

  // 2. Neon Postgres Configuration
  const [neonConfig, setNeonConfig] = useState<NeonConfig>(() => getSavedNeonConfig());

  // 3. Filter State
  const [filter, setFilter] = useState<FilterState>({
    monthYear: 'ALL',
    accountId: 'ALL',
    type: 'ALL',
    category: 'ALL',
    searchQuery: '',
    dateFrom: '',
    dateTo: '',
  });

    // Handler: Add Account (Admin)
  const handleAddAccount = async (newAcc: { name: string; type: 'cash' | 'bank' | 'ewallet'; initialBalance?: number }) => {
    const slug = newAcc.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    const id = `${slug || 'acc'}_${Date.now().toString(36).slice(-4)}`;
    const colorMap = { cash: 'emerald', bank: 'sky', ewallet: 'amber' };
    const iconMap = { cash: 'Wallet', bank: 'Landmark', ewallet: 'Smartphone' };
    const created: Account = {
      id,
      name: newAcc.name.trim(),
      type: newAcc.type,
      color: colorMap[newAcc.type] || 'slate',
      iconName: iconMap[newAcc.type] || 'Wallet',
      initialBalance: newAcc.initialBalance || 0,
    };
    try {
      await apiSaveAccount(created);
      setAccounts(prev => [...prev, created]);
      showToast(`Akun "${created.name}" berhasil ditambahkan!`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Gagal menyimpan akun. Periksa koneksi lalu coba lagi.', 'error');
    }
  };

  // Handler: Edit Account (Admin)
  const handleEditAccount = async (id: string, updated: { name: string; type: 'cash' | 'bank' | 'ewallet'; initialBalance?: number }) => {
    const existing = accounts.find(a => a.id === id);
    if (!existing) return;
    const merged: Account = {
      ...existing,
      name: updated.name.trim(),
      type: updated.type,
      initialBalance: updated.initialBalance !== undefined ? updated.initialBalance : existing.initialBalance,
    };
    try {
      await apiSaveAccount(merged);
      setAccounts(prev => prev.map(a => (a.id === id ? merged : a)));
      showToast(`Akun "${merged.name}" berhasil diperbarui!`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Gagal memperbarui akun. Periksa koneksi lalu coba lagi.', 'error');
    }
  };

  // Handler: Delete Account (Admin)
  const handleDeleteAccount = async (id: string) => {
    if (accounts.length <= 1) {
      showToast('Minimal harus ada 1 akun aktif di sistem.', 'error');
      return;
    }
    if (transactions.some(t => t.accountId === id || t.transferTargetAccountId === id)) {
      showToast('Akun tidak bisa dihapus karena masih punya transaksi.', 'error');
      return;
    }
    const acc = accounts.find(a => a.id === id);
    try {
      await apiDeleteAccount(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
      showToast(`Akun "${acc?.name || id}" berhasil dihapus.`, 'info');
    } catch (e) {
      console.error(e);
      showToast('Gagal menghapus akun. Periksa koneksi lalu coba lagi.', 'error');
    }
  };

  // 4. Modal States
  const [isAutoRecordOpen, setIsAutoRecordOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isNeonModalOpen, setIsNeonModalOpen] = useState(false);
  const [isExportImportOpen, setIsExportImportOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // 5. Admin Authentication State (token sesi dari server)
  const [isAdmin, setIsAdmin] = useState<boolean>(() => Boolean(getAdminToken()));
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  const handleLoginAdminSuccess = () => {
    setIsAdmin(true);
    showToast('Akses Admin Aktif! Fitur hapus data & pengeditan terbuka.', 'success');
  };

  const handleLogoutAdmin = () => {
    clearAdminToken();
    setIsAdmin(false);
    showToast('Mode Kasir aktif. Pengeditan dan penghapusan data dikunci.', 'info');
  };

  // Server menolak token (kedaluwarsa / tidak valid): kembali ke mode Kasir
  useEffect(() => {
    const onExpired = () => {
      setIsAdmin(false);
      setTimeout(() => showToast('Sesi admin berakhir. Masukkan PIN admin lagi.', 'error'), 100);
    };
    window.addEventListener('admin-session-expired', onExpired);
    return () => window.removeEventListener('admin-session-expired', onExpired);
  }, []);

  const handleOpenExportImport = () => {
    if (!isAdmin) {
      showToast('Masukkan PIN Admin untuk mengakses Ekspor & Impor data.', 'info');
      setIsAdminModalOpen(true);
      return;
    }
    setIsExportImportOpen(true);
  };

  const handleOpenNeonModal = () => {
    if (!isAdmin) {
      showToast('Masukkan PIN Admin untuk Pengaturan Database.', 'info');
      setIsAdminModalOpen(true);
      return;
    }
    setIsNeonModalOpen(true);
  };

  // 6. Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

    // Muat semua data dari database
  const loadAll = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiLoadAll();

      // Database masih kosong (pertama kali dipakai): isi data awal
      let accs = data.accounts;
      if (accs.length === 0) {
        accs = INITIAL_ACCOUNTS;
        await Promise.all(accs.map(a => apiSaveAccount(a)));
      }

      let cats = data.categories.filter(c => !isExcludedCategory(c));
      if (cats.length === 0) {
        cats = INITIAL_CATEGORIES.filter(c => !isExcludedCategory(c));
        await Promise.all(cats.map(c => apiAddCategory(c)));
      }

      setAccounts(accs);
      setTransactions(data.transactions);
      setCategories(cats);
      if (data.storeName && data.storeName.trim()) setStoreName(data.storeName.trim());
    } catch (e: any) {
      console.error(e);
      setLoadError(e.message || 'Gagal memuat data dari database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Month-Year dropdown options
  const monthOptions = useMemo(() => {
    return getMonthYearOptions(transactions);
  }, [transactions]);

  // Statistics calculation for the active view and wallets
  const stats: MonthlyStats = useMemo(() => {
    let totalMasuk = 0;
    let totalKeluar = 0;
    const categoryBreakdown: Record<string, number> = {};
    const dailyExpenses: Record<string, number> = {};

    transactions.forEach(t => {
      if (t.type === 'masuk') {
        totalMasuk += t.amount;
      } else {
        totalKeluar += t.amount;
        const cat = t.category || 'Lainnya';
        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + t.amount;
        dailyExpenses[t.date] = (dailyExpenses[t.date] || 0) + t.amount;
      }
    });

    const sisaSaldo = totalMasuk - totalKeluar;
    const sisaPersen = totalMasuk > 0 ? (sisaSaldo / totalMasuk) * 100 : 0;

    // 2. Real-time Account balances: calculated from account initialBalance + all actual recorded transactions
    const accountBalances: Record<string, number> = {};
    accounts.forEach(acc => {
      accountBalances[acc.id] = acc.initialBalance || 0;
    });

    transactions.forEach(t => {
      if (accountBalances[t.accountId] === undefined) {
        accountBalances[t.accountId] = 0;
      }
      if (t.type === 'masuk') {
        accountBalances[t.accountId] += t.amount;
      } else {
        accountBalances[t.accountId] -= t.amount;
      }
    });

    return {
      totalMasuk,
      totalKeluar,
      sisaSaldo,
      sisaPersen,
      transactionCount: transactions.length,
      categoryBreakdown,
      dailyExpenses,
      accountBalances,
    };
  }, [transactions, accounts]);

  // Filtered transactions matching the active filters
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filter.monthYear !== 'ALL' && !t.date.startsWith(filter.monthYear)) return false;
      if (filter.dateFrom && t.date < filter.dateFrom) return false;
      if (filter.dateTo && t.date > filter.dateTo) return false;
      if (filter.accountId !== 'ALL' && t.accountId !== filter.accountId && t.transferTargetAccountId !== filter.accountId) return false;
      if (filter.type !== 'ALL' && t.type !== filter.type) return false;
      if (filter.category !== 'ALL') {
        if (filter.category === 'EMPTY') {
          if (t.category && t.category.trim() !== '' && t.category !== '-') return false;
        } else if (t.category !== filter.category) {
          return false;
        }
      }
      if (filter.searchQuery.trim()) {
        const q = filter.searchQuery.toLowerCase();
        if (!t.description.toLowerCase().includes(q) && !t.category?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [transactions, filter]);

    const getNextNo = () =>
    (transactions.length > 0 ? Math.max(...transactions.map(t => t.no || 0)) : 0) + 1;

  // Handler: Add new transactions (from Auto Record)
  const handleAddTransactions = async (newItems: Omit<Transaction, 'id'>[]) => {
    const startNo = getNextNo();
    const created: Transaction[] = newItems.map((item, idx) => ({
      ...item,
      id: `tx-${Date.now()}-${idx}`,
      no: startNo + idx,
      createdAt: new Date().toISOString(),
    }));

    try {
      await apiSaveTransactions(created);
      setTransactions(prev => [...created, ...prev]);
      showToast(`Berhasil menambahkan ${created.length} transaksi!`);
    } catch (e) {
      console.error(e);
      showToast('Gagal menyimpan transaksi. Periksa koneksi lalu coba lagi.', 'error');
    }
  };

  // Handler: Save single transaction
  const handleSaveTransaction = async (txData: Omit<Transaction, 'id'>): Promise<boolean> => {
    const newTx: Transaction = {
      ...txData,
      id: `tx-${Date.now()}`,
      no: getNextNo(),
      createdAt: new Date().toISOString(),
    };
    try {
      await apiSaveTransaction(newTx);
      setTransactions(prev => [newTx, ...prev]);
      showToast(`Transaksi "${newTx.description}" (${formatRupiah(newTx.amount)}) berhasil disimpan!`);
      return true;
    } catch (e) {
      console.error(e);
      showToast('Gagal menyimpan transaksi. Periksa koneksi lalu coba lagi.', 'error');
      return false;
    }
  };

  // Handler: Edit / Update existing transaction (Admin)
  const handleEditTransaction = async (updatedTx: Transaction) => {
    try {
      await apiSaveTransaction(updatedTx);
      setTransactions(prev => prev.map(t => (t.id === updatedTx.id ? updatedTx : t)));
      showToast(`Transaksi "${updatedTx.description}" berhasil diperbarui!`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Gagal memperbarui transaksi. Periksa koneksi lalu coba lagi.', 'error');
    }
  };

  // Handler: Pindah Saldo / Transfer Antar Dompet
  const handleTransfer = async (
    fromAccId: string,
    toAccId: string,
    amount: number,
    date: string,
    notes: string
  ): Promise<boolean> => {
    const fromName = accounts.find(a => a.id === fromAccId)?.name || fromAccId;
    const toName = accounts.find(a => a.id === toAccId)?.name || toAccId;

    const baseNo = getNextNo();
    const transferId = `tf-${Date.now()}`;

    const txKeluar: Transaction = {
      id: `${transferId}-out`,
      no: baseNo,
      date,
      description: notes ? `${notes} (${toName})` : 'Pindah',
      accountId: fromAccId,
      type: 'keluar',
      category: 'Pindah Saldo',
      amount,
      transferTargetAccountId: toAccId,
      createdAt: new Date().toISOString(),
    };

    const txMasuk: Transaction = {
      id: `${transferId}-in`,
      no: baseNo + 1,
      date,
      description: notes ? `${notes} (${fromName})` : 'Pindah',
      accountId: toAccId,
      type: 'masuk',
      category: 'Pindah Saldo',
      amount,
      createdAt: new Date().toISOString(),
    };

    try {
      await apiSaveTransactions([txMasuk, txKeluar]);
      setTransactions(prev => [txMasuk, txKeluar, ...prev]);
      showToast(`Pindah saldo ${formatRupiah(amount)} dari ${fromName} ke ${toName} berhasil!`);
      return true;
    } catch (e) {
      console.error(e);
      showToast('Gagal memindahkan saldo. Periksa koneksi lalu coba lagi.', 'error');
      return false;
    }
  };

  // Handler: Batalkan transaksi terakhir (Undo last)
  const handleUndoLast = async () => {
    if (transactions.length === 0) return;
    const lastTx = transactions[0];

    const idsToRemove = [lastTx.id];
    if (lastTx.description.startsWith('Pindah') && transactions.length > 1) {
      const secondTx = transactions[1];
      if (secondTx.description.startsWith('Pindah') && secondTx.amount === lastTx.amount && secondTx.date === lastTx.date) {
        idsToRemove.push(secondTx.id);
      }
    }

    try {
      await Promise.all(idsToRemove.map(id => apiDeleteTransaction(id)));
      setTransactions(prev => prev.filter(t => !idsToRemove.includes(t.id)));
      showToast(`Transaksi terakhir "${lastTx.description}" (${formatRupiah(lastTx.amount)}) dibatalkan.`, 'info');
    } catch (e) {
      console.error(e);
      showToast('Gagal membatalkan transaksi. Periksa koneksi lalu coba lagi.', 'error');
    }
  };

  // Handler: Delete transaction
  const handleDeleteTransaction = async (id: string) => {
    const target = transactions.find(t => t.id === id);
    if (!confirm(`Hapus transaksi "${target?.description || ''}"?`)) return;
    try {
      await apiDeleteTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
      showToast('Transaksi telah dihapus.', 'info');
    } catch (e) {
      console.error(e);
      showToast('Gagal menghapus transaksi. Periksa koneksi lalu coba lagi.', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100/90 flex items-center justify-center text-sm font-semibold text-slate-500">
        Memuat data...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-100/90 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-semibold text-rose-700">Gagal memuat data dari database.</p>
        <p className="text-xs text-slate-500 break-words max-w-xs">{loadError}</p>
        <button
          type="button"
          onClick={loadAll}
          className="px-4 py-2 rounded-lg bg-[#1e3a5f] hover:bg-[#162c47] text-white text-xs font-bold cursor-pointer"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-800 flex flex-col antialiased selection:bg-emerald-600 selection:text-white">
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4">
          <div className={`px-4 py-2.5 rounded-xl shadow-lg border text-xs sm:text-sm font-semibold flex items-center gap-2 ${
            toast.type === 'error'
              ? 'bg-rose-900 text-rose-100 border-rose-700'
              : toast.type === 'info'
              ? 'bg-slate-800 text-slate-100 border-slate-700'
              : 'bg-emerald-800 text-emerald-100 border-emerald-600'
          }`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Content View matching screenshot with flexible width */}
      <main className="flex-1 w-full max-w-md sm:max-w-lg md:max-w-xl mx-auto px-3 sm:px-4 py-5 sm:py-8">
        <DompetTokoView
          accounts={accounts}
          transactions={transactions}
          stats={stats}
          neonConfig={neonConfig}
          onAddTransaction={handleSaveTransaction}
          onTransfer={handleTransfer}
          onUndoLast={handleUndoLast}
          onDeleteTransaction={handleDeleteTransaction}
          onEditTransaction={handleEditTransaction}
          onOpenAutoRecord={() => setIsAutoRecordOpen(true)}
          onOpenNeonModal={handleOpenNeonModal}
          onOpenExportImport={handleOpenExportImport}
          categories={categories}
          onAddCategory={handleAddCategory}
          onDeleteCategory={handleDeleteCategory}
          filter={filter}
          onFilterChange={(newF) => setFilter(prev => ({ ...prev, ...newF }))}
          monthOptions={monthOptions}
          isAdmin={isAdmin}
          onOpenAdminModal={() => setIsAdminModalOpen(true)}
          onLogoutAdmin={handleLogoutAdmin}
          storeName={storeName}
        />
      </main>

      {/* Footer info */}
      <footer className="py-4 text-center text-[11px] text-slate-400">
        {storeName} • Neon PostgreSQL & Vercel Ready
      </footer>

      {/* MODALS */}
      {/* 1. Auto Record Modal (Smart Parsing, SMS, AI Struk) */}
      <AutoRecordModal
        isOpen={isAutoRecordOpen}
        onClose={() => setIsAutoRecordOpen(false)}
        onAddTransactions={handleAddTransactions}
        accounts={accounts}
        categories={categories}
      />

      {/* 2. Neon PostgreSQL & Vercel Deploy Modal */}
      <NeonVercelModal
        isOpen={isNeonModalOpen}
        onClose={() => setIsNeonModalOpen(false)}
        neonConfig={neonConfig}
        onUpdateNeonConfig={(cfg) => {
          setNeonConfig(cfg);
          saveNeonConfig(cfg);
          showToast('Pengaturan Neon Postgres disimpan!');
        }}
        accounts={accounts}
        transactions={transactions}
        onDataLoadedFromNeon={(loadedAccounts, loadedTransactions) => {
          setAccounts(loadedAccounts);
          setTransactions(loadedTransactions);
          showToast('Data berhasil dimuat dari Neon PostgreSQL!');
        }}
      />

      {/* 3. Export / Import Modal */}
      <ExportImportModal
        isOpen={isExportImportOpen}
        onClose={() => setIsExportImportOpen(false)}
        transactions={transactions}
        filteredTransactions={filteredTransactions}
        accounts={accounts}
        onImportTransactions={async (imported) => {
          try {
            await apiSaveTransactions(imported);
            setTransactions(prev => [...imported, ...prev]);
            showToast(`${imported.length} transaksi berhasil diimpor!`);
          } catch (e) {
            console.error(e);
            showToast('Gagal mengimpor transaksi ke database.', 'error');
          }
        }}
      />

      {/* 4. Admin PIN & Access Modal */}
      <AdminPinModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        isAdmin={isAdmin}
        onLoginSuccess={handleLoginAdminSuccess}
        onLogoutAdmin={handleLogoutAdmin}
        storeName={storeName}
        onUpdateStoreName={handleUpdateStoreName}
        accounts={accounts}
        transactions={transactions}
        onAddAccount={handleAddAccount}
        onEditAccount={handleEditAccount}
        onDeleteAccount={handleDeleteAccount}
      />

    </div>
  );
}
