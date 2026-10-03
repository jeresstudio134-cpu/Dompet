import { Transaction, Account } from '../types/finance.ts';
import { INITIAL_ACCOUNTS, INITIAL_CATEGORIES, INITIAL_TRANSACTIONS } from '../data/initialData.ts';
import type { Debt, DebtPayment } from '../types/finance.ts';

const API_URL = '/api/transactions';
const TOKEN_KEY = 'dompet_admin_token';
const LOCAL_ACC_KEY = 'dompet_pintar_accounts';
const LOCAL_TX_KEY = 'dompet_pintar_transactions';
const LOCAL_CAT_KEY = 'dompet_pintar_categories';
const LOCAL_STORE_NAME_KEY = 'dompet_toko_store_name';
const LOCAL_PIN_KEY = 'dompet_toko_admin_pin';

// Token admin disimpan per sesi browser. Format: "<waktu kedaluwarsa>.<tanda tangan>"
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

// Helper LocalStorage untuk fallback offline dan dev mode
function getLocalAccounts(): Account[] {
  try {
    const stored = localStorage.getItem(LOCAL_ACC_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Error reading local accounts:', e);
  }
  return INITIAL_ACCOUNTS;
}

function saveLocalAccounts(accounts: Account[]) {
  try {
    localStorage.setItem(LOCAL_ACC_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.warn('Error saving local accounts:', e);
  }
}

function getLocalTransactions(): Transaction[] {
  try {
    const stored = localStorage.getItem(LOCAL_TX_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading local transactions:', e);
  }
  return INITIAL_TRANSACTIONS;
}

function saveLocalTransactions(transactions: Transaction[]) {
  try {
    localStorage.setItem(LOCAL_TX_KEY, JSON.stringify(transactions));
  } catch (e) {
    console.warn('Error saving local transactions:', e);
  }
}

function getLocalCategories(): string[] {
  try {
    const stored = localStorage.getItem(LOCAL_CAT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Error reading local categories:', e);
  }
  return INITIAL_CATEGORIES;
}

function saveLocalCategories(categories: string[]) {
  try {
    localStorage.setItem(LOCAL_CAT_KEY, JSON.stringify(categories));
  } catch (e) {
    console.warn('Error saving local categories:', e);
  }
}

function getLocalStoreName(): string {
  try {
    const stored = localStorage.getItem(LOCAL_STORE_NAME_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch (e) {
    console.warn('Error reading local store name:', e);
  }
  return 'JERES STUDIO';
}

function saveLocalStoreName(name: string) {
  try {
    localStorage.setItem(LOCAL_STORE_NAME_KEY, name.trim());
  } catch (e) {
    console.warn('Error saving local store name:', e);
  }
}

/**
 * Permintaan aman ke server API:
 * - Jika server merespons JSON: kembalikan objek JSON.
 * - Jika server merespons HTML (mis. Vite dev server SPA fallback): kembalikan null agar beralih ke cache lokal tanpa error.
 * - Jika offline / fetch gagal: kembalikan null atau throw jika mode mutasi ketat.
 */
async function safeRequest(url: string, options: RequestInit = {}): Promise<any | null> {
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
    // Server mengirim HTML (Vite dev fallback) -> endpoint API belum terpasang di host ini
    return null;
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  // Sesi admin ditolak server: hapus token dan beri tahu App
  if (res.status === 401 && token) {
    clearAdminToken();
    window.dispatchEvent(new Event('admin-session-expired'));
  }

  if (!res.ok || !json.success) {
    if (json.error) {
      throw new Error(json.error);
    }
    return null;
  }

  return json;
}

// Muat semua data sekaligus (server first dengan fallback lokal yang andal)
export const apiLoadAll = async (): Promise<{
  accounts: Account[];
  transactions: Transaction[];
  categories: string[];
  storeName: string | null;
}> => {
  const localAccounts = getLocalAccounts();
  const localTransactions = getLocalTransactions();
  const localCategories = getLocalCategories();
  const localStoreName = getLocalStoreName();

  try {
    const json = await safeRequest(API_URL);
    if (json && json.success) {
      const serverAccounts = (json.accounts || []) as Account[];
      const serverTransactions = (json.transactions || []) as Transaction[];
      const serverCategories = (json.categories || []) as string[];
      const serverStoreName = (json.storeName ?? null) as string | null;

      // Simpan salinan ke localStorage agar selalu cepat
      if (serverAccounts.length > 0) saveLocalAccounts(serverAccounts);
      if (serverTransactions.length > 0) saveLocalTransactions(serverTransactions);
      if (serverCategories.length > 0) saveLocalCategories(serverCategories);
      if (serverStoreName) saveLocalStoreName(serverStoreName);

      return {
        accounts: serverAccounts.length > 0 ? serverAccounts : localAccounts,
        transactions: serverTransactions.length > 0 ? serverTransactions : localTransactions,
        categories: serverCategories.length > 0 ? serverCategories : localCategories,
        storeName: serverStoreName || localStoreName,
      };
    }
  } catch (err) {
    console.warn('Koneksi server API tidak berhasil, memuat dari penyimpanan lokal:', err);
  }

  // Fallback lokal (selalu sukses di dev/preview/offline)
  return {
    accounts: localAccounts,
    transactions: localTransactions,
    categories: localCategories,
    storeName: localStoreName,
  };
};

// Transaksi
export const apiSaveTransaction = async (tx: Transaction) => {
  const current = getLocalTransactions();
  const exists = current.some(t => t.id === tx.id);
  const updated = exists ? current.map(t => (t.id === tx.id ? tx : t)) : [tx, ...current];
  saveLocalTransactions(updated);

  try {
    await safeRequest(API_URL, { method: 'POST', body: JSON.stringify(tx) });
  } catch {}
};

export const apiSaveTransactions = async (transactions: Transaction[]) => {
  if (transactions.length === 0) return;
  const current = getLocalTransactions();
  const newIds = new Set(transactions.map(t => t.id));
  const filtered = current.filter(t => !newIds.has(t.id));
  saveLocalTransactions([...transactions, ...filtered]);

  try {
    await safeRequest(API_URL, { method: 'POST', body: JSON.stringify({ batch: true, transactions }) });
  } catch {}
};

export const apiDeleteTransaction = async (id: string) => {
  const current = getLocalTransactions();
  saveLocalTransactions(current.filter(t => t.id !== id));

  try {
    await safeRequest(`${API_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {}
};

// Akun
export const apiSaveAccount = async (account: Account) => {
  const current = getLocalAccounts();
  const exists = current.some(a => a.id === account.id);
  const updated = exists ? current.map(a => (a.id === account.id ? account : a)) : [...current, account];
  saveLocalAccounts(updated);

  try {
    await safeRequest(API_URL, { method: 'POST', body: JSON.stringify({ entity: 'account', account }) });
  } catch {}
};

export const apiDeleteAccount = async (id: string) => {
  const current = getLocalAccounts();
  saveLocalAccounts(current.filter(a => a.id !== id));

  try {
    await safeRequest(`${API_URL}?entity=account&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {}
};

// Kategori
export const apiAddCategory = async (name: string) => {
  const current = getLocalCategories();
  if (!current.includes(name)) {
    saveLocalCategories([...current, name]);
  }

  try {
    await safeRequest(API_URL, { method: 'POST', body: JSON.stringify({ entity: 'category', name }) });
  } catch {}
};

export const apiDeleteCategory = async (name: string) => {
  const current = getLocalCategories();
  saveLocalCategories(current.filter(c => c !== name));

  try {
    await safeRequest(`${API_URL}?entity=category&name=${encodeURIComponent(name)}`, { method: 'DELETE' });
  } catch {}
};

// Pengaturan (mis. nama toko)
export const apiSaveSetting = async (key: string, value: string) => {
  if (key === 'store_name') {
    saveLocalStoreName(value);
  }

  try {
    await safeRequest(API_URL, { method: 'POST', body: JSON.stringify({ entity: 'setting', key, value }) });
  } catch {}
};

// Login admin: PIN diperiksa server, jika dev/offline periksa PIN lokal
export const apiLogin = async (pin: string) => {
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
    if (err.message && err.message.toLowerCase().includes('pin')) {
      throw err;
    }
  }

  // Fallback lokal jika server offline / dev
  const savedPin = localStorage.getItem(LOCAL_PIN_KEY) || '1234';
  if (pin === savedPin) {
    const expiry = Date.now() + 24 * 3600 * 1000;
    const token = `${expiry}.local_sig_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(TOKEN_KEY, token);
    return;
  }

  throw new Error('PIN Admin salah. Silakan periksa kembali PIN Anda.');
};

// Ubah PIN admin
export const apiChangePin = async (currentPin: string, newPin: string) => {
  let serverUpdated = false;
  try {
    const json = await safeRequest(API_URL, {
      method: 'POST',
      body: JSON.stringify({ entity: 'auth', action: 'change_pin', currentPin, newPin }),
    });
    if (json && json.success) {
      serverUpdated = true;
    }
  } catch (err: any) {
    if (err.message) {
      throw err;
    }
  }

  // Simpan juga secara lokal
  const savedPin = localStorage.getItem(LOCAL_PIN_KEY) || '1234';
  if (!serverUpdated && currentPin !== savedPin) {
    throw new Error('PIN lama tidak sesuai.');
  }

  localStorage.setItem(LOCAL_PIN_KEY, newPin);
  return { success: true };
};

// Panjang PIN admin (null jika belum diketahui), dipakai untuk login otomatis
export const apiPinLength = async (): Promise<number | null> => {
  try {
    const json = await safeRequest(API_URL, {
      method: 'POST',
      body: JSON.stringify({ entity: 'auth', action: 'pin_info' }),
    });
    if (json && typeof json.length === 'number') {
      return json.length;
    }
  } catch {}

  // Fallback lokal
  const savedPin = localStorage.getItem(LOCAL_PIN_KEY) || '1234';
  return savedPin.length;
};

// Pencatatan otomatis dengan Gemini (dipanggil lewat server, hanya admin)
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
      throw new Error(
        'Server backend belum siap. Pastikan Vercel deployment sudah selesai (Redeploy) dan database Neon terhubung.'
      );
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
    if (err.name === 'AbortError') {
      throw new Error('Waktu pemrosesan AI habis (>60 detik). Coba gunakan foto yang lebih terang atau ketik di tab teks.');
    }
    throw err;
  }
};

// ============================================
// API UTANG & PIUTANG
// ============================================

const DEBTS_API_URL = '/api/debts';
const LOCAL_DEBTS_KEY = 'dompet_pintar_debts';

// Helper LocalStorage untuk fallback offline
function getLocalDebts(): Debt[] {
  try {
    const stored = localStorage.getItem(LOCAL_DEBTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading local debts:', e);
  }
  return [];
}

function saveLocalDebts(debts: Debt[]) {
  try {
    localStorage.setItem(LOCAL_DEBTS_KEY, JSON.stringify(debts));
  } catch (e) {
    console.warn('Error saving local debts:', e);
  }
}

// Muat semua utang-piutang (server first, fallback lokal)
export const apiLoadDebts = async (): Promise<Debt[]> => {
  const localDebts = getLocalDebts();

  try {
    const json = await safeRequest(DEBTS_API_URL);
    if (json && json.success && Array.isArray(json.debts)) {
      const serverDebts = json.debts as Debt[];
      // Simpan salinan lokal agar cepat & offline-ready
      saveLocalDebts(serverDebts);
      return serverDebts;
    }
  } catch (err) {
    console.warn('Gagal memuat utang dari server, pakai local:', err);
  }

  return localDebts;
};

// Simpan (create/update) utang-piutang
export const apiSaveDebt = async (debt: Debt): Promise<void> => {
  // Update localStorage dulu (optimistic)
  const current = getLocalDebts();
  const exists = current.some(d => d.id === debt.id);
  const updated = exists
    ? current.map(d => (d.id === debt.id ? debt : d))
    : [debt, ...current];
  saveLocalDebts(updated);

  // Kirim ke server (kalau gagal, data tetap aman di local)
  try {
    await safeRequest(DEBTS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveDebt', payload: debt }),
    });
  } catch (err) {
    console.warn('Gagal sinkron saveDebt ke server:', err);
  }
};

// Hapus utang-piutang
export const apiDeleteDebt = async (id: string): Promise<void> => {
  const current = getLocalDebts();
  saveLocalDebts(current.filter(d => d.id !== id));

  try {
    await safeRequest(DEBTS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'deleteDebt', payload: { id } }),
    });
  } catch (err) {
    console.warn('Gagal sinkron deleteDebt ke server:', err);
  }
};

// Simpan pembayaran/angsuran
export const apiSaveDebtPayment = async (payment: DebtPayment): Promise<void> => {
  // Update lokal dulu
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

  try {
    await safeRequest(DEBTS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'savePayment', payload: payment }),
    });
  } catch (err) {
    console.warn('Gagal sinkron savePayment ke server:', err);
  }
};

// Hapus pembayaran
export const apiDeleteDebtPayment = async (paymentId: string): Promise<void> => {
  const current = getLocalDebts();
  const updated = current.map(d => ({
    ...d,
    payments: (d.payments || []).filter(p => p.id !== paymentId),
  }));
  saveLocalDebts(updated);

  try {
    await safeRequest(DEBTS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'deletePayment', payload: { id: paymentId } }),
    });
  } catch (err) {
    console.warn('Gagal sinkron deletePayment ke server:', err);
  }
};