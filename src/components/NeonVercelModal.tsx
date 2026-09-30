import React, { useState } from 'react';
import { 
  X, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  ArrowUpRight, 
  Copy, 
  Check, 
  UploadCloud, 
  DownloadCloud, 
  ExternalLink,
  Code2,
  Terminal,
  Globe
} from 'lucide-react';
import { NeonConfig, Transaction, Account } from '../types/finance.ts';
import { testNeonConnection, initNeonTables, syncAllToNeon, fetchAllFromNeon, saveNeonConfig } from '../lib/neon.ts';

interface NeonVercelModalProps {
  isOpen: boolean;
  onClose: () => void;
  neonConfig: NeonConfig;
  onUpdateNeonConfig: (config: NeonConfig) => void;
  accounts: Account[];
  transactions: Transaction[];
  onDataLoadedFromNeon: (accounts: Account[], transactions: Transaction[]) => void;
}

export const NeonVercelModal: React.FC<NeonVercelModalProps> = ({
  isOpen,
  onClose,
  neonConfig,
  onUpdateNeonConfig,
  accounts,
  transactions,
  onDataLoadedFromNeon,
}) => {
  const [activeTab, setActiveTab] = useState<'neon' | 'vercel' | 'sql'>('neon');
  const [connStr, setConnStr] = useState(neonConfig.connectionString || '');
  const [autoSync, setAutoSync] = useState(neonConfig.autoSync || false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestConnection = async () => {
    if (!connStr.trim()) {
      setStatusMsg({ type: 'error', text: 'Masukkan Connection String Neon PostgreSQL terlebih dahulu.' });
      return;
    }

    setIsTesting(true);
    setStatusMsg({ type: 'info', text: 'Menghubungkan ke Neon Postgres...' });

    const result = await testNeonConnection(connStr);
    setIsTesting(false);

    if (result.success) {
      const updated: NeonConfig = {
        connectionString: connStr.trim(),
        isConnected: true,
        autoSync,
        lastSyncedAt: new Date().toISOString(),
      };
      onUpdateNeonConfig(updated);
      saveNeonConfig(updated);
      setStatusMsg({ type: 'success', text: result.message });
    } else {
      setStatusMsg({ type: 'error', text: result.message });
    }
  };

  const handleInitTables = async () => {
    if (!connStr.trim()) {
      setStatusMsg({ type: 'error', text: 'Koneksi ke Neon belum disetel.' });
      return;
    }
    setIsTesting(true);
    setStatusMsg({ type: 'info', text: 'Membuat tabel "accounts" dan "transactions" di Neon...' });

    const result = await initNeonTables(connStr);
    setIsTesting(false);

    if (result.success) {
      setStatusMsg({ type: 'success', text: result.message });
    } else {
      setStatusMsg({ type: 'error', text: result.message });
    }
  };

  const handleSyncToNeon = async () => {
    if (!connStr.trim()) {
      setStatusMsg({ type: 'error', text: 'Koneksi ke Neon belum disetel.' });
      return;
    }
    setIsSyncing(true);
    setStatusMsg({ type: 'info', text: 'Mengunggah semua data lokal ke database Neon Postgres...' });

    const result = await syncAllToNeon(connStr, accounts, transactions);
    setIsSyncing(false);

    if (result.success) {
      const updated: NeonConfig = {
        connectionString: connStr.trim(),
        isConnected: true,
        autoSync,
        lastSyncedAt: new Date().toISOString(),
      };
      onUpdateNeonConfig(updated);
      saveNeonConfig(updated);
      setStatusMsg({ type: 'success', text: result.message });
    } else {
      setStatusMsg({ type: 'error', text: result.message });
    }
  };

  const handlePullFromNeon = async () => {
    if (!connStr.trim()) {
      setStatusMsg({ type: 'error', text: 'Koneksi ke Neon belum disetel.' });
      return;
    }
    setIsSyncing(true);
    setStatusMsg({ type: 'info', text: 'Mengunduh data transaksi dari database Neon Postgres...' });

    const result = await fetchAllFromNeon(connStr);
    setIsSyncing(false);

    if (result.success && result.transactions && result.accounts) {
      onDataLoadedFromNeon(result.accounts, result.transactions);
      setStatusMsg({ type: 'success', text: result.message });
    } else {
      setStatusMsg({ type: 'error', text: result.message });
    }
  };

  const SQL_SCHEMA_CODE = `-- Skema Database Neon PostgreSQL untuk Aplikasi Dompet Pintar
-- Jalankan di SQL Editor Neon: https://console.neon.tech

CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  color VARCHAR(20) DEFAULT '#0284c7',
  icon_name VARCHAR(50) DEFAULT 'Wallet',
  initial_balance BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

-- Indeks untuk query pelacakan bulanan yang cepat
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Neon PostgreSQL & Deploy ke Vercel
              </h2>
              <p className="text-xs text-slate-400">
                Hubungkan database cloud Neon Postgres dan deploy serverless ke Vercel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('neon')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition ${
              activeTab === 'neon'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🐘 Koneksi Neon Postgres
          </button>
          <button
            onClick={() => setActiveTab('vercel')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition ${
              activeTab === 'vercel'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ▲ Panduan Deploy Vercel
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`pb-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition ${
              activeTab === 'sql'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📄 Skema SQL DDL
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* TAB 1: NEON POSTGRES CONNECTION */}
          {activeTab === 'neon' && (
            <div className="space-y-4">
              
              <div className="bg-cyan-950/30 border border-cyan-500/20 rounded-2xl p-4 text-xs text-cyan-200 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-cyan-300">
                  <ExternalLink className="w-4 h-4" />
                  <span>Dapatkan URL Database Neon Gratis di neon.tech</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Buka <strong>https://console.neon.tech</strong>, buat database baru (Free Tier), lalu salin <strong>Connection string</strong> (format: <code>postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require</code>).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Neon PostgreSQL Connection String:
                </label>
                <input
                  type="password"
                  value={connStr}
                  onChange={(e) => setConnStr(e.target.value)}
                  placeholder="postgresql://user:password@ep-name.region.aws.neon.tech/neondb?sslmode=require"
                  className="w-full bg-slate-800 text-white font-mono text-xs rounded-xl p-3 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition"
                />
              </div>

              {/* Status Message */}
              {statusMsg && (
                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  statusMsg.type === 'success' 
                    ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300'
                    : statusMsg.type === 'error'
                    ? 'bg-rose-950/40 border border-rose-500/40 text-rose-300'
                    : 'bg-slate-800 border border-slate-700 text-cyan-300'
                }`}>
                  {statusMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{statusMsg.text}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting || !connStr.trim()}
                  className="py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <Database className="w-4 h-4" />
                  <span>{isTesting ? 'Mengetes...' : '1. Tes Koneksi Neon'}</span>
                </button>

                <button
                  onClick={handleInitTables}
                  disabled={isTesting || !connStr.trim()}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <Code2 className="w-4 h-4" />
                  <span>2. Buat Tabel & Skema</span>
                </button>

                <button
                  onClick={handleSyncToNeon}
                  disabled={isSyncing || !connStr.trim()}
                  className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>{isSyncing ? 'Mengunggah...' : '3. Push Data Lokal ke Neon'}</span>
                </button>

                <button
                  onClick={handlePullFromNeon}
                  disabled={isSyncing || !connStr.trim()}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>4. Tarik Data dari Neon</span>
                </button>
              </div>

              {/* Connection Status indicator */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${neonConfig.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  <span>
                    Status:{' '}
                    <strong className={neonConfig.isConnected ? 'text-emerald-400' : 'text-slate-400'}>
                      {neonConfig.isConnected ? 'Terhubung ke Neon PostgreSQL' : 'Mode Offline (Penyimpanan Lokal)'}
                    </strong>
                  </span>
                </div>
                {neonConfig.lastSyncedAt && (
                  <span className="text-[11px]">
                    Sinkron terakhir: {new Date(neonConfig.lastSyncedAt).toLocaleTimeString('id-ID')}
                  </span>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: VERCEL DEPLOYMENT GUIDE */}
          {activeTab === 'vercel' && (
            <div className="space-y-4 text-xs">
              
              <div className="bg-slate-950/60 rounded-2xl border border-slate-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>Langkah Deploy ke Vercel (Gratis & Cepat)</span>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-slate-300 leading-relaxed">
                  <li>
                    <strong>Push project ini ke GitHub</strong> Anda (repository baru).
                  </li>
                  <li>
                    Buka <strong>vercel.com/new</strong> dan impor repository GitHub Anda.
                  </li>
                  <li>
                    Di bagian <strong>Environment Variables</strong> di Vercel, tambahkan:
                    <div className="mt-2 bg-slate-900 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] text-cyan-300 flex items-center justify-between">
                      <span>DATABASE_URL=postgresql://...</span>
                      <button
                        onClick={() => copyToClipboard('DATABASE_URL=' + connStr, 'env')}
                        className="text-slate-400 hover:text-white"
                      >
                        {copiedKey === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </li>
                  <li>
                    Klik <strong>Deploy</strong>! Vercel akan otomatis build frontend Vite dan serverless backend <code>/api/transactions</code>.
                  </li>
                </ol>
              </div>

              {/* Ready config files in project */}
              <div className="space-y-2">
                <span className="font-bold text-slate-300">File Deployment yang Sudah Tersedia:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                    <span className="font-mono font-bold text-emerald-400 block">vercel.json</span>
                    <span className="text-[11px] text-slate-400">Konfigurasi build Vite & Vercel API rewrite routing.</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                    <span className="font-mono font-bold text-sky-400 block">api/transactions.ts</span>
                    <span className="text-[11px] text-slate-400">Serverless API handler untuk Neon Postgres CRUD di Vercel.</span>
                  </div>
                </div>
              </div>

              {/* Quick CLI command */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-300">Deploy Langsung Lewat Vercel CLI:</span>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-emerald-400 flex items-center justify-between">
                  <span>npx vercel --prod</span>
                  <button
                    onClick={() => copyToClipboard('npx vercel --prod', 'cli')}
                    className="text-slate-400 hover:text-white"
                  >
                    {copiedKey === 'cli' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: SQL SCHEMA */}
          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">
                  Salin skema SQL ini ke Neon SQL Editor jika ingin inisialisasi manual:
                </span>
                <button
                  onClick={() => copyToClipboard(SQL_SCHEMA_CODE, 'sql')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition"
                >
                  {copiedKey === 'sql' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'sql' ? 'Tersalin' : 'Salin SQL'}</span>
                </button>
              </div>

              <pre className="bg-slate-950 text-slate-300 p-4 rounded-2xl border border-slate-800 text-xs font-mono overflow-x-auto max-h-72">
                {SQL_SCHEMA_CODE}
              </pre>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex justify-end bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
