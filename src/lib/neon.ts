import { neon } from '@neondatabase/serverless';
import { Transaction, Account } from '../types/finance.ts';

export const NEON_STORAGE_KEY = 'dompet_pintar_neon_config';
export const LOCAL_TX_KEY = 'dompet_pintar_transactions';
export const LOCAL_ACC_KEY = 'dompet_pintar_accounts';

export const getSavedNeonConfig = () => {
  try {
    const raw = localStorage.getItem(NEON_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse neon config', e);
  }
  return {
    connectionString: '',
    isConnected: false,
    autoSync: false,
  };
};

export const saveNeonConfig = (config: {
  connectionString: string;
  isConnected: boolean;
  autoSync: boolean;
  lastSyncedAt?: string;
}) => {
  localStorage.setItem(NEON_STORAGE_KEY, JSON.stringify(config));
};

export const testNeonConnection = async (connectionString: string): Promise<{ success: boolean; message: string; version?: string }> => {
  if (!connectionString || !connectionString.trim()) {
    return { success: false, message: 'URL Database Neon tidak boleh kosong.' };
  }

  try {
    const sql = neon(connectionString.trim());
    const result = await sql`SELECT version(), current_database() as db_name, now() as current_time;`;
    if (result && result.length > 0) {
      return {
        success: true,
        message: `Terhubung ke Neon Postgres database "${result[0].db_name}"!`,
        version: result[0].version,
      };
    }
    return { success: false, message: 'Tidak dapat mengambil respon dari server Neon.' };
  } catch (err: any) {
    console.error('Neon test connection error:', err);
    return {
      success: false,
      message: err.message || 'Gagal terhubung ke Neon PostgreSQL. Periksa URL koneksi dan parameter sslmode=require.',
    };
  }
};

export const initNeonTables = async (connectionString: string): Promise<{ success: boolean; message: string }> => {
  try {
    const sql = neon(connectionString.trim());
    
    // Create accounts table
    await sql`
      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        color VARCHAR(20) DEFAULT '#0284c7',
        icon_name VARCHAR(50) DEFAULT 'Wallet',
        initial_balance BIGINT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create transactions table
    await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(64) PRIMARY KEY,
        no INTEGER,
        date DATE NOT NULL,
        description VARCHAR(255) NOT NULL,
        account_id VARCHAR(50) REFERENCES accounts(id) ON DELETE SET NULL,
        type VARCHAR(10) NOT NULL,
        category VARCHAR(50) NOT NULL,
        amount BIGINT NOT NULL,
        notes TEXT,
        transfer_target_account_id VARCHAR(50),
        linked_transaction_id VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create index on date and account for fast monthly filtering
    await sql`
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
    `;

    return {
      success: true,
      message: 'Tabel "accounts" dan "transactions" berhasil disiapkan di Neon PostgreSQL!',
    };
  } catch (err: any) {
    console.error('Neon init tables error:', err);
    return {
      success: false,
      message: err.message || 'Gagal membuat tabel di database Neon.',
    };
  }
};

export const syncAllToNeon = async (
  connectionString: string,
  accounts: Account[],
  transactions: Transaction[]
): Promise<{ success: boolean; count: number; message: string }> => {
  try {
    const sql = neon(connectionString.trim());

    // 1. Ensure tables exist
    await initNeonTables(connectionString);

    // 2. Upsert accounts
    for (const acc of accounts) {
      await sql`
        INSERT INTO accounts (id, name, type, color, icon_name, initial_balance)
        VALUES (${acc.id}, ${acc.name}, ${acc.type}, ${acc.color}, ${acc.iconName}, ${acc.initialBalance})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          color = EXCLUDED.color,
          icon_name = EXCLUDED.icon_name,
          initial_balance = EXCLUDED.initial_balance;
      `;
    }

    // 3. Upsert transactions
    let pushed = 0;
    for (const tx of transactions) {
      await sql`
        INSERT INTO transactions (
          id, no, date, description, account_id, type, category, amount, notes, transfer_target_account_id, linked_transaction_id, created_at
        ) VALUES (
          ${tx.id},
          ${tx.no ?? null},
          ${tx.date},
          ${tx.description},
          ${tx.accountId},
          ${tx.type},
          ${tx.category},
          ${tx.amount},
          ${tx.notes ?? null},
          ${tx.transferTargetAccountId ?? null},
          ${tx.linkedTransactionId ?? null},
          ${tx.createdAt ? new Date(tx.createdAt).toISOString() : new Date().toISOString()}
        )
        ON CONFLICT (id) DO UPDATE SET
          no = EXCLUDED.no,
          date = EXCLUDED.date,
          description = EXCLUDED.description,
          account_id = EXCLUDED.account_id,
          type = EXCLUDED.type,
          category = EXCLUDED.category,
          amount = EXCLUDED.amount,
          notes = EXCLUDED.notes,
          transfer_target_account_id = EXCLUDED.transfer_target_account_id,
          linked_transaction_id = EXCLUDED.linked_transaction_id;
      `;
      pushed++;
    }

    return {
      success: true,
      count: pushed,
      message: `Berhasil sinkronisasi ${pushed} transaksi & ${accounts.length} dompet ke Neon PostgreSQL!`,
    };
  } catch (err: any) {
    console.error('Neon sync error:', err);
    return {
      success: false,
      count: 0,
      message: err.message || 'Gagal sinkronisasi data ke Neon PostgreSQL.',
    };
  }
};

export const fetchAllFromNeon = async (
  connectionString: string
): Promise<{ success: boolean; accounts?: Account[]; transactions?: Transaction[]; message: string }> => {
  try {
    const sql = neon(connectionString.trim());

    // Fetch accounts
    const accRows = await sql`
      SELECT id, name, type, color, icon_name, initial_balance FROM accounts ORDER BY id ASC;
    `;

    // Fetch transactions
    const txRows = await sql`
      SELECT 
        id, 
        no, 
        to_char(date, 'YYYY-MM-DD') as date, 
        description, 
        account_id as "accountId", 
        type, 
        category, 
        amount, 
        notes, 
        transfer_target_account_id as "transferTargetAccountId", 
        linked_transaction_id as "linkedTransactionId", 
        created_at as "createdAt"
      FROM transactions 
      ORDER BY date DESC, no DESC NULLS LAST, id DESC;
    `;

    const accounts: Account[] = accRows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      color: r.color || '#0284c7',
      iconName: r.icon_name || 'Wallet',
      initialBalance: Number(r.initial_balance) || 0,
    }));

    const transactions: Transaction[] = txRows.map(r => ({
      id: r.id,
      no: r.no ? Number(r.no) : undefined,
      date: r.date,
      description: r.description,
      accountId: r.accountId,
      type: r.type,
      category: r.category,
      amount: Number(r.amount) || 0,
      notes: r.notes || undefined,
      transferTargetAccountId: r.transferTargetAccountId || undefined,
      linkedTransactionId: r.linkedTransactionId || undefined,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
    }));

    return {
      success: true,
      accounts,
      transactions,
      message: `Berhasil memuat ${transactions.length} transaksi dari Neon Postgres.`,
    };
  } catch (err: any) {
    console.error('Neon fetch error:', err);
    return {
      success: false,
      message: err.message || 'Gagal memuat data dari Neon PostgreSQL.',
    };
  }
};
