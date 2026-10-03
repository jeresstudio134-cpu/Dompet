export type TransactionType = 'masuk' | 'keluar';

export type DefaultCategory = 
  | 'Pribadi'
  | 'Pokok'
  | 'Kendaraan'
  | 'Bangun Rumah'
  | 'Operasional'
  | 'Pemasukan Toko'
  | 'Pindah Saldo'
  | 'Lainnya';

export interface Account {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'ewallet';
  color: string;
  iconName: string;
  initialBalance: number;
}

export interface Transaction {
  id: string;
  no?: number;
  date: string; // YYYY-MM-DD
  description: string;
  accountId: string;
  type: TransactionType;
  category: string;
  amount: number;
  notes?: string;
  transferTargetAccountId?: string;
  linkedTransactionId?: string;
  createdAt?: string;
}

export interface FilterState {
  monthYear: string; // '2026-07' or 'ALL'
  accountId: string; // 'ALL' or account id
  type: 'ALL' | TransactionType;
  category: string; // 'ALL' or category name
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface MonthlyStats {
  totalMasuk: number;
  totalKeluar: number;
  sisaSaldo: number;
  sisaPersen: number;
  transactionCount: number;
  categoryBreakdown: { [category: string]: number };
  dailyExpenses: { [day: string]: number };
  accountBalances: { [accountId: string]: number };
}

export interface NeonConfig {
  connectionString: string;
  isConnected: boolean;
  lastSyncedAt?: string;
  autoSync: boolean;
}

// ============================================
// UTANG & PIUTANG
// ============================================

export type DebtType = 'utang' | 'piutang'; // utang = kita berutang, piutang = orang berutang ke kita
export type DebtStatus = 'aktif' | 'lunas';

export interface DebtPayment {
  id: string;
  debtId: string;
  date: string;          // YYYY-MM-DD
  amount: number;
  accountId?: string;    // akun yang dipakai bayar/terima (opsional)
  notes?: string;
}

export interface Debt {
  id: string;
  type: DebtType;
  name: string;              // mis. "Motor Vario", "Pinjam Ali"
  counterparty: string;      // mis. "Dealer Honda", "Ali"
  totalAmount: number;       // total utang/piutang
  startDate: string;         // YYYY-MM-DD
  dueDate?: string;          // YYYY-MM-DD (opsional, jatuh tempo akhir)
  installmentAmount?: number;// cicilan per bulan (opsional)
  installmentPeriod?: number;// jumlah cicilan (opsional)
  notes?: string;
  createdAt: string;
  payments: DebtPayment[];   // riwayat pembayaran
  // status dihitung otomatis dari totalAmount vs sum(payments)
}
