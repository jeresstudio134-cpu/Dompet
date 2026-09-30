-- Neon PostgreSQL Database Schema for Dompet Pintar / Dompet Toko
-- Run this in the Neon SQL Editor (https://console.neon.tech)

-- 1. Accounts Table (Dompet / Rekening: Cash, Dana, Seabank, ShopeePay)
CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  color VARCHAR(20) DEFAULT '#0284c7',
  icon_name VARCHAR(50) DEFAULT 'Wallet',
  initial_balance BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Transactions Table
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

-- 3. Optimization Indexes for Monthly & Account Queries
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);

-- 4. Initial Seed for Accounts matching DOMPET TOKO
INSERT INTO accounts (id, name, type, color, icon_name, initial_balance) VALUES
  ('cash', 'Cash', 'cash', '#10b981', 'Banknote', 0),
  ('dana', 'Dana', 'ewallet', '#0284c7', 'Smartphone', 0),
  ('seabank', 'Seabank', 'bank', '#ea580c', 'Building2', 0),
  ('shoopepay', 'ShopeePay', 'ewallet', '#f97316', 'CreditCard', 0)
ON CONFLICT (id) DO NOTHING;
