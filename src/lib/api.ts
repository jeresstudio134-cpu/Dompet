import { Transaction, Account } from '../types/finance.ts';
import { INITIAL_ACCOUNTS, INITIAL_CATEGORIES, INITIAL_TRANSACTIONS } from '../data/initialData.ts';
import type { Debt, DebtPayment } from '../types/finance.ts';

const API_URL = '/api/transactions';
const DEBTS_API_URL = '/api/debts';
const TOKEN_KEY = 'dompet_admin_token';
const LOCAL_ACC_KEY = 'dompet_pintar_accounts';
const LOCAL_TX_KEY = 'dompet_pintar_transactions';
const LOCAL_CAT_KEY = 'dompet_pintar_categories';
const LOCAL_STORE_NAME_KEY = 'dompet_toko_store_name';
const LOCAL_PIN_KEY = 'dompet_toko_admin_pin';
const LOCAL_DEBTS_KEY = 'dompet_pintar_debts';

// Deteksi environment: apakah backend tersedia?
// Di Vercel: backend tersedia. Di AI Studio / Vite dev: tidak tersedia.
let backendAvailable: boolean | null = null;

async function checkBackend(): Promise<boolean> {
  if (backendAvailable !== null) return backendAvailable;
  try {
    const res = await fetch(API_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    const ct = res.headers.get('content-type') || '';
    backendAvailable = ct.includes('application/json');
  } catch {
    backendAvailable = false;
  }
  return backendAvailable;
}

// ============================================
// TOKEN ADMIN
// ============================================

export const getAdminToken = (): string | null => {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const expiry = Number(token.split('.')[0]);
    if (!expiry || expiry < Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

export const clearAdminToken = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
};

// ============================================
// LOCALSTORAGE HELPERS
// ============================================

function getLocalAccounts(): Account[] {
  try {
    const stored = localStorage.getItem(LOCAL_ACC_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return INITIAL_ACCOUNTS;
}

function saveLocalAccounts(accounts: Account[]) {
  try {
    localStorage.setItem(LOCAL_ACC_KEY, JSON.stringify(accounts));
  } catch {}
}

function getLocalTransactions(): Transaction[] {
  try {
    const stored = localStorage.getItem(LOCAL_TX_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return INITIAL_TRANSACTIONS;
}

function saveLocalTransactions(transactions: Transaction[]) {
  try {
    localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(transactions));
  } catch {}
}

function getLocalCategories(): string[] {
  try {
    const stored = localStorage.getItem(LOCAL_CAT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return INITIAL_CATEGORIES;
}

function saveLocalCategories(categories: string[]) {
  try {
    localStorage.setItem(LOCAL_CAT_KEY, JSON.stringify(categories));
  } catch {}
}

function getLocalStoreName(): string {
  try {
    const stored = localStorage.getItem(LOCAL_STORE_NAME_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {}
  return 'JERES STUDIO';
}

function saveLocalStoreName(name: string) {
  try {
    localStorage.setItem(LOCAL_STORE_NAME_KEY, name.trim());
  } catch {}
}

function getLocalDebts(): Debt[] {
  try {
    const stored = localStorage.getItem(LOCAL_DEBTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalDebts(debts: Debt[]) {
  try {
    localStorage.setItem(LOCAL_DEBTS_KEY, JSON.stringify(debts));
  } catch {}
}

// ============================================
// SAFE REQUEST (dengan fallback silent kalau backend tidak ada)
// ============================================

async function safeRequest(url: string, options: RequestInit = {}): Promise<any | null> {
  const hasBackend = await checkBackend();
  if (!hasBackend) return null; // Backend tidak ada → fallback ke local

  const token = getAdminToken();

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-admin-token': token } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    return null;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Server kirim HTML (fallback Vite dev)
    backendAvailable = false;
    return null;
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  // Sesi admin ditolak
  if (res.status === 401 && token) {
    clearAdminToken();
    window.dispatchEvent(new Event('admin-session-expired'));
  }

  if (!res.ok || !json.success) {
    if (json.error) throw new Error(json.error);
    return null;
  }

  return json;
}

// ============================================
// LOAD SEMUA DATA
// ============================================

export const apiLoadAll = async (): Promise<{
  accounts: Account[];
  transactions: Transaction[];
  categories: string[];
  storeName: string | null;
}> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    try {
      const json = await safeRequest(API_URL);
      if (json && json.success) {
        const serverAccounts = (json.accounts || []) as Account[];
        const serverTransactions = (json.transactions || []) as Transaction[];
        const serverCategories = (json.categories || []) as string[];
        const serverStoreName = (json.storeName ?? null) as string | null;

        // Simpan cache untuk baca cepat
        if (serverAccounts.length > 0) saveLocalAccounts(serverAccounts);
        if (serverTransactions.length > 0) saveLocalTransactions(serverTransactions);
        if (serverCategories.length > 0) saveLocalCategories(serverCategories);
        if (serverStoreName) saveLocalStoreName(serverStoreName);

        return {
          accounts: serverAccounts,
          transactions: serverTransactions,
          categories: serverCategories,
          storeName: serverStoreName,
        };
      }
    } catch (err) {
      console.warn('Backend error, fallback ke lokal:', err);
    }
  }

  // Fallback: pakai localStorage (khusus dev/AI Studio)
  return {
    accounts: getLocalAccounts(),
    transactions: getLocalTransactions(),
    categories: getLocalCategories(),
    storeName: getLocalStoreName(),
  };
};

// ============================================
// TRANSAKSI
// ============================================

export const apiSaveTransaction = async (tx: Transaction): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(API_URL, {
      method: 'POST',
      body: JSON.stringify(tx),
    });
  } else {
    // Dev fallback
    const current = getLocalTransactions();
    const exists = current.some(t => t.id === tx.id);
    const updated = exists ? current.map(t => (t.id === tx.id ? tx : t)) : [tx, ...current];
    saveLocalTransactions(updated);
  }
};

export const apiSaveTransactions = async (transactions: Transaction[]): Promise<void> => {
  if (transactions.length === 0) return;
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(API_URL, {
      method: 'POST',
      body: JSON.stringify({ batch: true, transactions }),
    });
  } else {
    const current = getLocalTransactions();
    const newIds = new Set(transactions.map(t => t.id));
    const filtered = current.filter(t => !newIds.has(t.id));
    saveLocalTransactions([...transactions, ...filtered]);
  }
};

export const apiDeleteTransaction = async (id: string): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(`${API_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } else {
    const current = getLocalTransactions();
    saveLocalTransactions(current.filter(t => t.id !== id));
  }
};

// ============================================
// AKUN
// ============================================

export const apiSaveAccount = async (account: Account): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(API_URL, {
      method: 'POST',
      body: JSON.stringify({ entity: 'account', account }),
    });
  } else {
    const current = getLocalAccounts();
    const exists = current.some(a => a.id === account.id);
    const updated = exists ? current.map(a => (a.id === account.id ? account : a)) : [...current, account];
    saveLocalAccounts(updated);
  }
};

export const apiDeleteAccount = async (id: string): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(`${API_URL}?entity=account&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } else {
    const current = getLocalAccounts();
    saveLocalAccounts(current.filter(a => a.id !== id));
  }
};

// ============================================
// KATEGORI
// ============================================

export const apiAddCategory = async (name: string): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(API_URL, {
      method: 'POST',
      body: JSON.stringify({ entity: 'category', name }),
    });
  } else {
    const current = getLocalCategories();
    if (!current.includes(name)) saveLocalCategories([...current, name]);
  }
};

export const apiDeleteCategory = async (name: string): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(`${API_URL}?entity=category&name=${encodeURIComponent(name)}`, { method: 'DELETE' });
  } else {
    const current = getLocalCategories();
    saveLocalCategories(current.filter(c => c !== name));
  }
};

// ============================================
// PENGATURAN
// ============================================

export const apiSaveSetting = async (key: string, value: string): Promise<void> => {
  if (key === 'store_name') saveLocalStoreName(value);

  const hasBackend = await checkBackend();
  if (hasBackend) {
    await safeRequest(API_URL, {
      method: 'POST',
      body: JSON.stringify({ entity: 'setting', key, value }),
    });
  }
};

// ============================================
// AUTH
// ============================================

export const apiLogin = async (pin: string): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    try {
      const json = await safeRequest(API_URL, {
        method: 'POST',
        body: JSON.stringify({ entity: 'auth', action: 'login', pin }),
      });
      if (json && json.token) {
        sessionStorage.setItem(TOKEN_KEY, json.token);
        return;
      }
    } catch (err: any) {
      if (err.message && err.message.toLowerCase().includes('pin')) throw err;
    }
  }

  // Local fallback (dev / offline)
  const savedPin = localStorage.getItem(LOCAL_PIN_KEY) || '1234';
  if (pin === savedPin) {
    const expiry = Date.now() + 24 * 3600 * 1000;
    const token = `${expiry}.local_sig_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(TOKEN_KEY, token);
    return;
  }
  throw new Error('PIN Admin salah. Silakan periksa kembali PIN Anda.');
};

export const apiChangePin = async (currentPin: string, newPin: string): Promise<void> => {
  let serverUpdated = false;
  const hasBackend = await checkBackend();

  if (hasBackend) {
    try {
      const json = await safeRequest(API_URL, {
        method: 'POST',
        body: JSON.stringify({ entity: 'auth', action: 'change_pin', currentPin, newPin }),
      });
      if (json && json.success) serverUpdated = true;
    } catch (err: any) {
      if (err.message) throw err;
    }
  }

  const savedPin = localStorage.getItem(LOCAL_PIN_KEY) || '1234';
  if (!serverUpdated && currentPin !== savedPin) {
    throw new Error('PIN lama tidak sesuai.');
  }
  localStorage.setItem(LOCAL_PIN_KEY, newPin);
};

export const apiPinLength = async (): Promise<number | null> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    try {
      const json = await safeRequest(API_URL, {
        method: 'POST',
        body: JSON.stringify({ entity: 'auth', action: 'pin_info' }),
      });
      if (json && typeof json.length === 'number') return json.length;
    } catch {}
  }

  const savedPin = localStorage.getItem(LOCAL_PIN_KEY) || '1234';
  return savedPin.length;
};

// ============================================
// AI PARSE (transaksi)
// ============================================

export interface AiParsedItem {
  date: string;
  description: string;
  accountId: string;
  type: 'masuk' | 'keluar';
  category: string;
  amount: number;
  transferToAccountId: string;
}

export const apiAiParse = async (payload: {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<AiParsedItem[]> => {
  const hasBackend = await checkBackend();
  if (!hasBackend) {
    throw new Error('Fitur AI tidak tersedia di AI Studio. Silakan buka di Vercel.');
  }

  const token = getAdminToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-admin-token': token } : {}),
      },
      body: JSON.stringify({ entity: 'ai_parse', ...payload }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Server backend belum siap.');
    }

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Server AI error (${res.status}).`);
    }

    if (!Array.isArray(json.transactions)) {
      throw new Error('AI tidak menemukan data transaksi.');
    }

    return json.transactions as AiParsedItem[];
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Waktu pemrosesan AI habis.');
    throw err;
  }
};

// ============================================
// UTANG & PIUTANG
// ============================================

export const apiLoadDebts = async (): Promise<Debt[]> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    try {
      const json = await safeRequest(DEBTS_API_URL);
      if (json && json.success && Array.isArray(json.debts)) {
        const serverDebts = json.debts as Debt[];
        saveLocalDebts(serverDebts);
        return serverDebts;
      }
    } catch (err) {
      console.warn('Gagal load debts dari server:', err);
    }
  }

  return getLocalDebts();
};

export const apiSaveDebt = async (debt: Debt): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(DEBTS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveDebt', payload: debt }),
    });
  } else {
    const current = getLocalDebts();
    const exists = current.some(d => d.id === debt.id);
    const updated = exists ? current.map(d => (d.id === debt.id ? debt : d)) : [debt, ...current];
    saveLocalDebts(updated);
  }
};

export const apiDeleteDebt = async (id: string): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(DEBTS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'deleteDebt', payload: { id } }),
    });
  } else {
    const current = getLocalDebts();
    saveLocalDebts(current.filter(d => d.id !== id));
  }
};

export const apiSaveDebtPayment = async (payment: DebtPayment): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(DEBTS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'savePayment', payload: payment }),
    });
  } else {
    const current = getLocalDebts();
    const updated = current.map(d => {
      if (d.id !== payment.debtId) return d;
      const payments = d.payments || [];
      const exists = payments.some(p => p.id === payment.id);
      const newPayments = exists
        ? payments.map(p => (p.id === payment.id ? payment : p))
        : [...payments, payment];
      return { ...d, payments: newPayments };
    });
    saveLocalDebts(updated);
  }
};

export const apiDeleteDebtPayment = async (paymentId: string): Promise<void> => {
  const hasBackend = await checkBackend();

  if (hasBackend) {
    await safeRequest(DEBTS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'deletePayment', payload: { id: paymentId } }),
    });
  } else {
    const current = getLocalDebts();
    const updated = current.map(d => ({
      ...d,
      payments: (d.payments || []).filter(p => p.id !== paymentId),
    }));
    saveLocalDebts(updated);
  }
};