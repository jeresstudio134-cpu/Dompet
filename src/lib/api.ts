import { Transaction, Account } from '../types/finance.ts';

const API_URL = '/api/transactions';
const TOKEN_KEY = 'dompet_admin_token';

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

async function request(url: string, options: RequestInit = {}) {
  const token = getAdminToken();

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(60000),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-admin-token': token } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error('Server tidak merespons. Periksa koneksi lalu coba lagi.');
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error('Server API tidak merespons dengan benar.');
  }

  // Sesi admin ditolak server: hapus token dan beri tahu App
  if (res.status === 401 && token) {
    clearAdminToken();
    window.dispatchEvent(new Event('admin-session-expired'));
  }

  if (!res.ok || !json.success) {
    throw new Error(json.error || `Permintaan gagal (${res.status})`);
  }
  return json;
}

// Muat semua data sekaligus
export const apiLoadAll = async () => {
  let json: any;
  try {
    json = await request(API_URL);
  } catch {
    // Percobaan pertama sering gagal saat server/database baru bangun
    await new Promise(resolve => setTimeout(resolve, 1500));
    json = await request(API_URL);
  }

  return {
    accounts: (json.accounts || []) as Account[],
    transactions: (json.transactions || []) as Transaction[],
    categories: (json.categories || []) as string[],
    storeName: (json.storeName ?? null) as string | null,
  };
};

// Transaksi
export const apiSaveTransaction = (tx: Transaction) =>
  request(API_URL, { method: 'POST', body: JSON.stringify(tx) });

export const apiSaveTransactions = (transactions: Transaction[]) =>
  request(API_URL, { method: 'POST', body: JSON.stringify({ batch: true, transactions }) });

export const apiDeleteTransaction = (id: string) =>
  request(`${API_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });

// Akun
export const apiSaveAccount = (account: Account) =>
  request(API_URL, { method: 'POST', body: JSON.stringify({ entity: 'account', account }) });

export const apiDeleteAccount = (id: string) =>
  request(`${API_URL}?entity=account&id=${encodeURIComponent(id)}`, { method: 'DELETE' });

// Kategori
export const apiAddCategory = (name: string) =>
  request(API_URL, { method: 'POST', body: JSON.stringify({ entity: 'category', name }) });

export const apiDeleteCategory = (name: string) =>
  request(`${API_URL}?entity=category&name=${encodeURIComponent(name)}`, { method: 'DELETE' });

// Pengaturan (mis. nama toko)
export const apiSaveSetting = (key: string, value: string) =>
  request(API_URL, { method: 'POST', body: JSON.stringify({ entity: 'setting', key, value }) });

// Login admin: PIN diperiksa server, token disimpan untuk sesi ini
export const apiLogin = async (pin: string) => {
  const json = await request(API_URL, {
    method: 'POST',
    body: JSON.stringify({ entity: 'auth', action: 'login', pin }),
  });
  try {
    sessionStorage.setItem(TOKEN_KEY, json.token);
  } catch {}
};

export const apiChangePin = (currentPin: string, newPin: string) =>
  request(API_URL, {
    method: 'POST',
    body: JSON.stringify({ entity: 'auth', action: 'change_pin', currentPin, newPin }),
  });

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
  const json = await request(API_URL, {
    method: 'POST',
    body: JSON.stringify({ entity: 'ai_parse', ...payload }),
  });
  return (json.transactions || []) as AiParsedItem[];
};