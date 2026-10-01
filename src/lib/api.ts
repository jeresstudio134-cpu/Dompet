import { Transaction, Account } from '../types/finance.ts';
import { 
  LOCAL_ACC_KEY, 
  LOCAL_TX_KEY, 
  getSavedNeonConfig, 
  fetchAllFromNeon,
  persistTransactionToDatabase,
  removeTransactionFromDatabase,
  persistAccountToDatabase,
  removeAccountFromDatabase,
  persistSettingToDatabase,
  fetchSettingFromDatabase
} from './neon.ts';
import { INITIAL_ACCOUNTS, INITIAL_CATEGORIES } from '../data/initialData.ts';

const API_URL = '/api/transactions';
const TOKEN_KEY = 'dompet_admin_token';
const LOCAL_PIN_KEY = 'dompet_toko_admin_pin';
const LOCAL_CAT_KEY = 'dompet_pintar_categories';
const LOCAL_STORE_NAME_KEY = 'dompet_toko_store_name';

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

// Safe request wrapper that checks for valid JSON content-type
// If the server endpoint is not available or returns HTML (Vite dev server SPA fallback), returns null instead of throwing
async function safeRequest(url: string, options: RequestInit = {}): Promise<any | null> {
  const token = getAdminToken();
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-admin-token': token } : {}),
        ...(options.headers || {}),
      },
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      // Returned HTML or other non-JSON -> API endpoint is not running on this server
      return null;
    }

    const json = await res.json();

    if (res.status === 401 && token) {
      clearAdminToken();
      window.dispatchEvent(new Event('admin-session-expired'));
    }

    if (!res.ok || !json.success) {
      throw new Error(json.error || `Permintaan gagal (${res.status})`);
    }

    return json;
  } catch (err: any) {
    // If it's a genuine API error message from the server, throw it
    if (err.message && !err.message.includes('Unexpected token') && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
      throw err;
    }
    return null;
  }
}

// LocalStorage Helpers
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
  return [];
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
  return 'Dompet Toko';
}

function saveLocalStoreName(name: string) {
  try {
    localStorage.setItem(LOCAL_STORE_NAME_KEY, name.trim());
  } catch (e) {
    console.warn('Error saving local store name:', e);
  }
}

// Merge accounts: preserve local accounts and add remote accounts
function mergeAccounts(local: Account[], remote: Account[]): Account[] {
  const accountMap = new Map<string, Account>();
  remote.forEach(acc => accountMap.set(acc.id, acc));
  local.forEach(acc => accountMap.set(acc.id, acc));
  return Array.from(accountMap.values());
}

// 1. Muat semua data sekaligus
export const apiLoadAll = async (): Promise<{
  accounts: Account[];
  transactions: Transaction[];
  categories: string[];
  storeName: string | null;
}> => {
  const localAccs = getLocalAccounts();
  const localTxs = getLocalTransactions();
  const localCats = getLocalCategories();
  const localStoreName = getLocalStoreName();
  const neonConfig = getSavedNeonConfig();

  // 1. Try Vercel Serverless API (/api/transactions)
  const apiResult = await safeRequest(API_URL);
  if (apiResult && apiResult.success) {
    const remoteAccs: Account[] = Array.isArray(apiResult.accounts) ? apiResult.accounts : [];
    const remoteTxs: Transaction[] = Array.isArray(apiResult.transactions) ? apiResult.transactions : [];
    const remoteCats: string[] = Array.isArray(apiResult.categories) ? apiResult.categories : [];
    const remoteStoreName: string | null = apiResult.storeName || null;

    const finalAccounts = remoteAccs.length > 0 ? mergeAccounts(localAccs, remoteAccs) : localAccs;
    const finalTxs = remoteTxs.length > 0 ? remoteTxs : localTxs;
    const finalCats = remoteCats.length > 0 ? remoteCats : localCats;
    const finalStoreName = remoteStoreName || localStoreName;

    saveLocalAccounts(finalAccounts);
    saveLocalTransactions(finalTxs);
    saveLocalCategories(finalCats);
    if (finalStoreName) saveLocalStoreName(finalStoreName);

    // Sync any local accounts that are not in remote database
    if (remoteAccs.length > 0) {
      const remoteIds = new Set(remoteAccs.map(a => a.id));
      localAccs
        .filter(a => !remoteIds.has(a.id))
        .forEach(a => apiSaveAccount(a).catch(console.warn));
    }

    return {
      accounts: finalAccounts,
      transactions: finalTxs,
      categories: finalCats,
      storeName: finalStoreName,
    };
  }

  // 2. Direct Neon if configured
  if (neonConfig.connectionString && neonConfig.connectionString.trim()) {
    try {
      const neonRes = await fetchAllFromNeon(neonConfig.connectionString.trim());
      if (neonRes && neonRes.success) {
        const nAccs = neonRes.accounts || [];
        const nTxs = neonRes.transactions || [];
        if (nAccs.length > 0 || nTxs.length > 0) {
          const finalAccounts = mergeAccounts(localAccs, nAccs);
          const finalTxs = nTxs.length > 0 ? nTxs : localTxs;

          saveLocalAccounts(finalAccounts);
          saveLocalTransactions(finalTxs);

          const remoteName = await fetchSettingFromDatabase('store_name', neonConfig.connectionString.trim());
          if (remoteName) saveLocalStoreName(remoteName);

          return {
            accounts: finalAccounts,
            transactions: finalTxs,
            categories: localCats,
            storeName: remoteName || localStoreName,
          };
        }
      }
    } catch (err) {
      console.warn('Neon direct fetch skipped:', err);
    }
  }

  // 3. Fallback to LocalStorage (Always works offline and in dev!)
  return {
    accounts: localAccs,
    transactions: localTxs,
    categories: localCats,
    storeName: localStoreName,
  };
};

// 2. Transaksi
export const apiSaveTransaction = async (tx: Transaction): Promise<any> => {
  const current = getLocalTransactions();
  const exists = current.some(t => t.id === tx.id);
  const updated = exists ? current.map(t => (t.id === tx.id ? tx : t)) : [tx, ...current];
  saveLocalTransactions(updated);

  const neonConfig = getSavedNeonConfig();
  persistTransactionToDatabase(tx, neonConfig.connectionString).catch(console.warn);

  return safeRequest(API_URL, {
    method: 'POST',
    body: JSON.stringify(tx),
  });
};

export const apiSaveTransactions = async (transactions: Transaction[]): Promise<any> => {
  if (transactions.length === 0) return;
  const current = getLocalTransactions();
  const newIds = new Set(transactions.map(t => t.id));
  const filtered = current.filter(t => !newIds.has(t.id));
  saveLocalTransactions([...transactions, ...filtered]);

  const neonConfig = getSavedNeonConfig();
  transactions.forEach(tx => persistTransactionToDatabase(tx, neonConfig.connectionString).catch(console.warn));

  return safeRequest(API_URL, {
    method: 'POST',
    body: JSON.stringify({ batch: true, transactions }),
  });
};

export const apiDeleteTransaction = async (id: string): Promise<any> => {
  const current = getLocalTransactions();
  saveLocalTransactions(current.filter(t => t.id !== id));

  const neonConfig = getSavedNeonConfig();
  removeTransactionFromDatabase(id, neonConfig.connectionString).catch(console.warn);

  return safeRequest(`${API_URL}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
};

// 3. Akun
export const apiSaveAccount = async (account: Account): Promise<any> => {
  const current = getLocalAccounts();
  const exists = current.some(a => a.id === account.id);
  const updated = exists ? current.map(a => (a.id === account.id ? account : a)) : [...current, account];
  saveLocalAccounts(updated);

  const neonConfig = getSavedNeonConfig();
  persistAccountToDatabase(account, neonConfig.connectionString).catch(console.warn);

  return safeRequest(API_URL, {
    method: 'POST',
    body: JSON.stringify({ entity: 'account', account }),
  });
};

export const apiDeleteAccount = async (id: string): Promise<any> => {
  const current = getLocalAccounts();
  saveLocalAccounts(current.filter(a => a.id !== id));

  const neonConfig = getSavedNeonConfig();
  removeAccountFromDatabase(id, neonConfig.connectionString).catch(console.warn);

  return safeRequest(`${API_URL}?entity=account&id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
};

// 4. Kategori
export const apiAddCategory = async (name: string): Promise<any> => {
  const current = getLocalCategories();
  if (!current.includes(name)) {
    saveLocalCategories([...current, name]);
  }

  return safeRequest(API_URL, {
    method: 'POST',
    body: JSON.stringify({ entity: 'category', name }),
  });
};

export const apiDeleteCategory = async (name: string): Promise<any> => {
  const current = getLocalCategories();
  saveLocalCategories(current.filter(c => c !== name));

  return safeRequest(`${API_URL}?entity=category&name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
};

// 5. Pengaturan (mis. nama toko)
export const apiSaveSetting = async (key: string, value: string): Promise<any> => {
  if (key === 'store_name') {
    saveLocalStoreName(value);
  }

  const neonConfig = getSavedNeonConfig();
  persistSettingToDatabase(key, value, neonConfig.connectionString).catch(console.warn);

  return safeRequest(API_URL, {
    method: 'POST',
    body: JSON.stringify({ entity: 'setting', key, value }),
  });
};

// 6. Login Admin: Coba server, jika offline/dev periksa PIN lokal
export const apiLogin = async (pin: string): Promise<void> => {
  const res = await safeRequest(API_URL, {
    method: 'POST',
    body: JSON.stringify({ entity: 'auth', action: 'login', pin }),
  });

  if (res && res.token) {
    try {
      sessionStorage.setItem(TOKEN_KEY, res.token);
    } catch {}
    return;
  }

  // Fallback: periksa PIN lokal
  const savedPin = localStorage.getItem(LOCAL_PIN_KEY) || '1234';
  if (pin === savedPin) {
    const expiry = Date.now() + 24 * 3600 * 1000;
    const token = `${expiry}.local_${Date.now().toString(36)}`;
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {}
    return;
  }

  throw new Error('PIN Admin salah. Silakan coba lagi.');
};

// 7. Ubah PIN Admin
export const apiChangePin = async (currentPin: string, newPin: string): Promise<any> => {
  const res = await safeRequest(API_URL, {
    method: 'POST',
    body: JSON.stringify({ entity: 'auth', action: 'change_pin', currentPin, newPin }),
  });

  if (res && res.success) {
    try {
      localStorage.setItem(LOCAL_PIN_KEY, newPin);
    } catch {}
    return res;
  }

  // Fallback: periksa dan ubah PIN lokal
  const savedPin = localStorage.getItem(LOCAL_PIN_KEY) || '1234';
  if (currentPin !== savedPin) {
    throw new Error('PIN lama tidak sesuai.');
  }

  if (!newPin || newPin.length < 4) {
    throw new Error('PIN baru minimal 4 angka.');
  }

  localStorage.setItem(LOCAL_PIN_KEY, newPin);
  return { success: true };
};
