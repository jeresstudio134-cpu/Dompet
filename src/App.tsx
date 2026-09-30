/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { 
  INITIAL_ACCOUNTS, 
  INITIAL_CATEGORIES, 
  INITIAL_TRANSACTIONS 
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
import { 
  LOCAL_ACC_KEY, 
  LOCAL_TX_KEY, 
  getSavedNeonConfig, 
  saveNeonConfig,
  syncAllToNeon,
  persistTransactionToDatabase,
  removeTransactionFromDatabase,
  fetchAllFromNeon
} from './lib/neon.ts';

// Components
import { DompetTokoView } from './components/DompetTokoView.tsx';
import { AutoRecordModal } from './components/AutoRecordModal.tsx';
import { AddTransactionModal } from './components/AddTransactionModal.tsx';
import { NeonVercelModal } from './components/NeonVercelModal.tsx';
import { ExportImportModal } from './components/ExportImportModal.tsx';
import { AdminPinModal } from './components/AdminPinModal.tsx';

export default function App() {
  // 1. Core State: Accounts & Transactions
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_ACC_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error('Failed loading stored accounts:', e);
    }
    return INITIAL_ACCOUNTS;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_TX_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error('Failed loading stored transactions:', e);
    }
    return INITIAL_TRANSACTIONS;
  });

  // Store Name state (persisted in localStorage)
  const [storeName, setStoreName] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('dompet_toko_store_name');
      if (saved && saved.trim()) return saved.trim();
    } catch {}
    return 'Dompet Toko';
  });

  const handleUpdateStoreName = (newName: string) => {
    const trimmed = newName.trim() || 'Dompet Toko';
    setStoreName(trimmed);
    try {
      localStorage.setItem('dompet_toko_store_name', trimmed);
    } catch {}
    showToast(`Nama toko berhasil diubah menjadi "${trimmed}"!`, 'success');
  };

  // Dynamic Categories (stored in localStorage, excluding 'Lainnya' / 'lainya')
  const isExcludedCategory = (name?: string) => {
    if (!name) return true;
    const lower = name.trim().toLowerCase();
    return lower === '' || lower === '-' || lower === 'lainnya' || lower === 'lainya' || lower === 'lain-lain' || lower === 'lain nya';
  };

  const [categories, setCategories] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('dompet_pintar_categories');
      if (stored) {
        const parsed: string[] = JSON.parse(stored);
        return parsed.filter(c => !isExcludedCategory(c));
      }
    } catch (e) {
      console.error('Failed loading stored categories:', e);
    }
    return INITIAL_CATEGORIES.filter(c => !isExcludedCategory(c));
  });

  useEffect(() => {
    localStorage.setItem('dompet_pintar_categories', JSON.stringify(categories));
  }, [categories]);

  const handleAddCategory = (newCat: string) => {
    const trimmed = newCat.trim();
    if (!trimmed || isExcludedCategory(trimmed)) return;
    if (!categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setCategories(prev => [...prev, trimmed]);
      showToast(`Kategori baru "${trimmed}" berhasil ditambahkan!`);
    }
  };

  const handleDeleteCategory = (catToDelete: string) => {
    setCategories(prev => prev.filter(c => c !== catToDelete));
    // Clear this category from existing transactions so it won't resurrect in any category lists
    setTransactions(prev => prev.map(t => {
      if (t.category === catToDelete) {
        return { ...t, category: '' };
      }
      return t;
    }));
    showToast(`Kategori "${catToDelete}" telah dihapus.`, 'info');
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
  const handleAddAccount = (newAcc: { name: string; type: 'cash' | 'bank' | 'ewallet'; initialBalance?: number }) => {
    const slug = newAcc.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    const id = `${slug || 'acc'}_${Date.now().toString(36).slice(-4)}`;
    const colorMap = {
      cash: 'emerald',
      bank: 'sky',
      ewallet: 'amber',
    };
    const iconMap = {
      cash: 'Wallet',
      bank: 'Landmark',
      ewallet: 'Smartphone',
    };
    const created: Account = {
      id,
      name: newAcc.name.trim(),
      type: newAcc.type,
      color: colorMap[newAcc.type] || 'slate',
      iconName: iconMap[newAcc.type] || 'Wallet',
      initialBalance: newAcc.initialBalance || 0,
    };
    setAccounts(prev => [...prev, created]);
    showToast(`Akun "${created.name}" berhasil ditambahkan!`, 'success');
  };

  // Handler: Edit Account (Admin)
  const handleEditAccount = (id: string, updated: { name: string; type: 'cash' | 'bank' | 'ewallet'; initialBalance?: number }) => {
    setAccounts(prev => prev.map(a => a.id === id ? { 
      ...a, 
      name: updated.name.trim(), 
      type: updated.type,
      initialBalance: updated.initialBalance !== undefined ? updated.initialBalance : a.initialBalance
    } : a));
    showToast(`Akun "${updated.name}" berhasil diperbarui!`, 'success');
  };

  // Handler: Delete Account (Admin)
  const handleDeleteAccount = (id: string) => {
    if (accounts.length <= 1) {
      showToast('Minimal harus ada 1 akun aktif di sistem.', 'error');
      return;
    }
    const acc = accounts.find(a => a.id === id);
    setAccounts(prev => prev.filter(a => a.id !== id));
    showToast(`Akun "${acc?.name || id}" berhasil dihapus.`, 'info');
  };

  // 4. Modal States
  const [isAutoRecordOpen, setIsAutoRecordOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isNeonModalOpen, setIsNeonModalOpen] = useState(false);
  const [isExportImportOpen, setIsExportImportOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // 5. Admin Authentication State
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('dompet_is_admin_active') === 'true';
    } catch {
      return false;
    }
  });
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  const handleLoginAdminSuccess = () => {
    setIsAdmin(true);
    try {
      sessionStorage.setItem('dompet_is_admin_active', 'true');
    } catch {}
    showToast('Akses Admin Aktif! Fitur hapus data & pengeditan terbuka.', 'success');
  };

  const handleLogoutAdmin = () => {
    setIsAdmin(false);
    try {
      sessionStorage.removeItem('dompet_is_admin_active');
    } catch {}
    showToast('Mode Kasir aktif. Pengeditan dan penghapusan data dikunci.', 'info');
  };

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

  // Sync state to LocalStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_ACC_KEY, JSON.stringify(accounts));
  }, [accounts]);

  useEffect(() => {
    localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(transactions));
  }, [transactions]);

  // Initial remote sync: load from Neon or Vercel serverless API
  useEffect(() => {
    let isMounted = true;
    const fetchRemoteData = async () => {
      // 1. Direct Neon if connection string is configured
      if (neonConfig.connectionString && neonConfig.connectionString.trim()) {
        try {
          const res = await fetchAllFromNeon(neonConfig.connectionString);
          if (isMounted && res.success && res.transactions && res.transactions.length > 0) {
            setTransactions(res.transactions);
            if (res.accounts && res.accounts.length > 0) {
              setAccounts(res.accounts);
            }
            return;
          }
        } catch (e) {
          console.warn('Neon direct fetch skipped, trying /api/transactions fallback...', e);
        }
      }

      // 2. Vercel Serverless API fallback (reads DATABASE_URL)
      try {
        const resp = await fetch('/api/transactions');
        if (resp.ok) {
          const json = await resp.json();
          if (isMounted && json.success && Array.isArray(json.transactions) && json.transactions.length > 0) {
            setTransactions(json.transactions);
            if (Array.isArray(json.accounts) && json.accounts.length > 0) {
              setAccounts(json.accounts);
            }
          }
        }
      } catch (e) {
        // Ignore network error in preview
      }
    };

    fetchRemoteData();
    return () => { isMounted = false; };
  }, [neonConfig.connectionString]);

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

  // Handler: Add new transactions (from Auto Record or Manual)
  const handleAddTransactions = (newItems: Omit<Transaction, 'id'>[]) => {
    const created: Transaction[] = newItems.map((item, idx) => ({
      ...item,
      id: `tx-${Date.now()}-${idx}`,
      no: (transactions.length > 0 ? Math.max(...transactions.map(t => t.no || 0)) : 0) + idx + 1,
      createdAt: new Date().toISOString(),
    }));

    setTransactions(prev => [...created, ...prev]);
    showToast(`Berhasil menambahkan ${created.length} transaksi!`);

    // Auto-sync each transaction to database
    created.forEach(tx => persistTransactionToDatabase(tx, neonConfig.connectionString).catch(console.error));
  };

  // Handler: Save single transaction
  const handleSaveTransaction = (txData: Omit<Transaction, 'id'>) => {
    const nextNo = (transactions.length > 0 ? Math.max(...transactions.map(t => t.no || 0)) : 0) + 1;
    const newTx: Transaction = {
      ...txData,
      id: `tx-${Date.now()}`,
      no: nextNo,
      createdAt: new Date().toISOString(),
    };
    setTransactions(prev => [newTx, ...prev]);
    persistTransactionToDatabase(newTx, neonConfig.connectionString).catch(console.error);
    showToast(`Transaksi "${newTx.description}" (${formatRupiah(newTx.amount)}) berhasil disimpan!`);
  };

  // Handler: Edit / Update existing transaction (Admin)
  const handleEditTransaction = (updatedTx: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));
    persistTransactionToDatabase(updatedTx, neonConfig.connectionString).catch(console.error);
    showToast(`Transaksi "${updatedTx.description}" berhasil diperbarui!`, 'success');
  };

  // Handler: Pindah Saldo / Transfer Antar Dompet
  const handleTransfer = (
    fromAccId: string,
    toAccId: string,
    amount: number,
    date: string,
    notes: string
  ) => {
    const fromName = accounts.find(a => a.id === fromAccId)?.name || fromAccId;
    const toName = accounts.find(a => a.id === toAccId)?.name || toAccId;

    const baseNo = (transactions.length > 0 ? Math.max(...transactions.map(t => t.no || 0)) : 0) + 1;
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

    setTransactions(prev => [txMasuk, txKeluar, ...prev]);
    persistTransactionToDatabase(txMasuk, neonConfig.connectionString).catch(console.error);
    persistTransactionToDatabase(txKeluar, neonConfig.connectionString).catch(console.error);
    showToast(`Pindah saldo ${formatRupiah(amount)} dari ${fromName} ke ${toName} berhasil!`);
  };

  // Handler: Batalkan transaksi terakhir (Undo last)
  const handleUndoLast = () => {
    if (transactions.length === 0) return;
    const lastTx = transactions[0];

    let idsToRemove = [lastTx.id];
    if (lastTx.description.startsWith('Pindah') && transactions.length > 1) {
      const secondTx = transactions[1];
      if (secondTx.description.startsWith('Pindah') && secondTx.amount === lastTx.amount && secondTx.date === lastTx.date) {
        idsToRemove.push(secondTx.id);
      }
    }

    setTransactions(prev => prev.filter(t => !idsToRemove.includes(t.id)));
    idsToRemove.forEach(id => removeTransactionFromDatabase(id, neonConfig.connectionString).catch(console.error));
    showToast(`Transaksi terakhir "${lastTx.description}" (${formatRupiah(lastTx.amount)}) dibatalkan.`, 'info');
  };

  // Handler: Delete transaction
  const handleDeleteTransaction = (id: string) => {
    const target = transactions.find(t => t.id === id);
    if (confirm(`Hapus transaksi "${target?.description || ''}"?`)) {
      setTransactions(prev => prev.filter(t => t.id !== id));
      removeTransactionFromDatabase(id, neonConfig.connectionString).catch(console.error);
      showToast('Transaksi telah dihapus.', 'info');
    }
  };

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
          onUpdateStoreName={handleUpdateStoreName}
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
        onImportTransactions={(imported) => {
          setTransactions(prev => [...imported, ...prev]);
          showToast(`${imported.length} transaksi berhasil diimpor!`);
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
