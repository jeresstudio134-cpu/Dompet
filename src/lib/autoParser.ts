import { Transaction, TransactionType } from '../types/finance.ts';
import { getCurrentDateIndo } from '../utils/formatters.ts';

export interface ParsedTransactionResult {
  date: string;
  description: string;
  accountId: string;
  type: TransactionType;
  category: string;
  amount: number;
  transferTargetAccountId?: string;
  confidence: number; // 0 to 1
  rawText: string;
}

// Category keyword mappings for auto-tagging
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Pemasukan Toko': ['pemasukan', 'penjualan', 'toko', 'omset', 'orderan', 'pelanggan', 'gaji', 'untung', 'pendapatan', 'transfer masuk'],
  'Kendaraan': ['bensin', 'pertalite', 'pertamax', 'solar', 'tambal ban', 'cuci motor', 'servis', 'oli', 'parkir', 'tol', 'gojek', 'grab'],
  'Bangun Rumah': ['semen', 'batu bata', 'pasir', 'cat tembok', 'bor', 'paku', 'keramik', 'genteng', 'tukang', 'material', 'triplek', 'kayu', 'palet'],
  'Pokok': ['listrik', 'token', 'wifi', 'indihome', 'pdam', 'air', 'sembako', 'beras', 'minyak', 'telur', 'shopeepaylater', 'shopeelater', 'bri', 'panci', 'dapur', 'belanja bulanan', 'kontrakan', 'sewa'],
  'Pribadi': ['bakso', 'bubur', 'mie ayam', 'donat', 'susu', 'jajan', 'makan', 'kopi', 'cafe', 'rokok', 'obat', 'sunatan', 'buwuh', 'amal', 'sedekah', 'masjid', 'dipinjam', 'nonton', 'baju', 'kaos', 'shampoo', 'sabun'],
  'Operasional Toko': ['stiker', 'banner', 'ongkir', 'lanyard', 'dtf', 'vinyl', 'kertas', 'packaging', 'opp', 'plastik', 'solasi', 'lakban', 'resi', 'macbook', 'charger', 'frame', 'atk', 'tinta', 'printer'],
  'Pindah Saldo': ['pindah', 'transfer antar', 'tf', 'top up', 'tarik tunai', 'setor'],
};

// Account detection keywords
const ACCOUNT_KEYWORDS: Record<string, string[]> = {
  cash: ['cash', 'tunai', 'uang tunai', 'dompet'],
  dana: ['dana', 'e-dana', 'edana'],
  seabank: ['seabank', 'sea bank', 'sea', 'rek seabank'],
  shoopepay: ['shopee', 'shopeepay', 'shoppe', 'spay', 'shope pay'],
};

export const parseAmountFromText = (text: string): number => {
  // Matches expressions like: 50rb, 50k, 1.5jt, 2,5jt, Rp 50.000, 50000, Rp50.000,00
  const lower = text.toLowerCase();
  
  // 1. Handle "jt" / "juta" (e.g., "1.5jt", "2 jt")
  const jtMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:jt|juta)\b/);
  if (jtMatch) {
    const num = parseFloat(jtMatch[1].replace(',', '.'));
    return Math.round(num * 1_000_000);
  }

  // 2. Handle "rb" / "k" / "ribu" (e.g., "50rb", "25k", "150 ribu")
  const rbMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(?:rb|k|ribu)\b/);
  if (rbMatch) {
    const num = parseFloat(rbMatch[1].replace(',', '.'));
    return Math.round(num * 1_000);
  }

  // 3. Handle standard Rupiah or numeric with formatting: "Rp 150.000", "Rp. 50.000", "125.000"
  const rpMatch = lower.match(/(?:rp\.?|idr)?\s*([0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?)/);
  if (rpMatch) {
    const clean = rpMatch[1].split(',')[0].replace(/\./g, '');
    return parseInt(clean, 10);
  }

  // 4. Handle plain integers with 4 or more digits e.g. "50000", "5000"
  const plainMatch = text.match(/\b([1-9][0-9]{3,8})\b/);
  if (plainMatch) {
    return parseInt(plainMatch[1], 10);
  }

  return 0;
};

export const detectAccount = (text: string, defaultAccount = 'cash'): string => {
  const lower = text.toLowerCase();
  for (const [accountId, keywords] of Object.entries(ACCOUNT_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return accountId;
    }
  }
  return defaultAccount;
};

export const detectCategory = (text: string, type: TransactionType): string => {
  const lower = text.toLowerCase();

  // If it's income, default to Pemasukan Toko unless specified
  if (type === 'masuk') {
    if (lower.includes('pindah') || lower.includes('tf') || lower.includes('transfer')) {
      return 'Pindah Saldo';
    }
    return 'Pemasukan Toko';
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category;
    }
  }

  return 'Pribadi';
};

export const detectTransactionType = (text: string): TransactionType => {
  const lower = text.toLowerCase();
  const incomeKeywords = ['masuk', 'pemasukan', 'penjualan', 'omzet', 'omset', 'dapat', 'terima', 'gaji', 'untung', 'setor', 'laba', 'diterima'];
  const expenseKeywords = ['keluar', 'pengeluaran', 'beli', 'bayar', 'jajan', 'makan', 'bensin', 'biaya', 'ongkir', 'amal', 'tagihan', 'belanja'];

  let incomeScore = 0;
  let expenseScore = 0;

  incomeKeywords.forEach(kw => { if (lower.includes(kw)) incomeScore += 1; });
  expenseKeywords.forEach(kw => { if (lower.includes(kw)) expenseScore += 1; });

  if (incomeScore > expenseScore) return 'masuk';
  return 'keluar';
};

export const detectDate = (text: string): string => {
  const today = getCurrentDateIndo();
  const lower = text.toLowerCase();

  if (lower.includes('kemarin')) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  // Check YYYY-MM-DD
  const isoMatch = text.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Check DD-MM-YYYY or DD/MM/YYYY
  const indoMatch = text.match(/\b(0[1-9]|[12]\d|3[01])[-/](0[1-9]|1[0-2])[-/](20\d{2})\b/);
  if (indoMatch) {
    return `${indoMatch[3]}-${indoMatch[2]}-${indoMatch[1]}`;
  }

  // Check "15 Juli 2026"
  const monthNames: Record<string, string> = {
    januari: '01', feb: '02', februari: '02', maret: '03', mar: '03',
    april: '04', apr: '04', mei: '05', juni: '06', jun: '06',
    juli: '07', jul: '07', agustus: '08', agu: '08', september: '09',
    sep: '09', oktober: '10', okt: '10', november: '11', nov: '11', desember: '12', des: '12'
  };

  const textMonthMatch = lower.match(/\b([1-9]|[12]\d|3[01])\s+([a-z]+)\s+(20\d{2})\b/);
  if (textMonthMatch) {
    const day = textMonthMatch[1].padStart(2, '0');
    const monthStr = textMonthMatch[2];
    const year = textMonthMatch[3];
    if (monthNames[monthStr]) {
      return `${year}-${monthNames[monthStr]}-${day}`;
    }
  }

  return today;
};

export const parseSmartSentence = (rawText: string): ParsedTransactionResult => {
  const trimmed = rawText.trim();
  const amount = parseAmountFromText(trimmed);
  const type = detectTransactionType(trimmed);
  const date = detectDate(trimmed);
  const accountId = detectAccount(trimmed, 'cash');
  const category = detectCategory(trimmed, type);

  // Clean description by removing detected amounts, dates, and account words
  let description = trimmed;
  // Remove amount tokens
  description = description.replace(/(?:rp\.?|idr)?\s*[\d.,]+\s*(?:jt|juta|rb|k|ribu)?/gi, '');
  // Remove trigger words
  description = description.replace(/\b(kemarin|hari ini|besok|pake|pakai|lewat|via|ke|dari|akun|kategori|catat|masuk|keluar|beli|bayar)\b/gi, '');
  // Remove account names
  description = description.replace(/\b(cash|tunai|dana|seabank|shopee|shopeepay)\b/gi, '');
  // Clean whitespace & punctuation
  description = description.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  // If description became empty, fallback to category or friendly name
  if (!description || description.length < 2) {
    if (trimmed.toLowerCase().includes('bensin')) description = 'Bensin';
    else if (trimmed.toLowerCase().includes('bakso')) description = 'Bakso';
    else if (trimmed.toLowerCase().includes('wifi')) description = 'Bulanan Wifi';
    else if (trimmed.toLowerCase().includes('listrik')) description = 'Listrik';
    else if (trimmed.toLowerCase().includes('semen')) description = 'Semen';
    else if (type === 'masuk') description = 'Pemasukan Toko';
    else description = category || 'Pengeluaran';
  } else {
    // Capitalize first letter
    description = description.charAt(0).toUpperCase() + description.slice(1);
  }

  // Check for transfer ("pindah dari seabank ke cash")
  let transferTargetAccountId: string | undefined = undefined;
  const lower = trimmed.toLowerCase();
  if (lower.includes('pindah') || lower.includes('transfer')) {
    if (lower.includes('ke cash')) transferTargetAccountId = 'cash';
    else if (lower.includes('ke dana')) transferTargetAccountId = 'dana';
    else if (lower.includes('ke seabank')) transferTargetAccountId = 'seabank';
    else if (lower.includes('ke shopee') || lower.includes('ke spay')) transferTargetAccountId = 'shoopepay';
  }

  return {
    date,
    description,
    accountId,
    type,
    category,
    amount,
    transferTargetAccountId,
    confidence: amount > 0 ? 0.9 : 0.4,
    rawText,
  };
};

export const parseMultiLineText = (multiText: string): ParsedTransactionResult[] => {
  const lines = multiText.split('\n').map(l => l.trim()).filter(Boolean);
  const results: ParsedTransactionResult[] = [];

  for (const line of lines) {
    // If line has tab or semicolon or comma (CSV/Excel copy-paste format: e.g. "10 Juli 2026\tBulanan Wifi\tSeabank\tKeluar\tPokok\t125.000")
    if (line.includes('\t') || (line.includes(';') && line.split(';').length >= 4)) {
      const parts = line.split(line.includes('\t') ? '\t' : ';').map(p => p.trim());
      // Try to detect columns
      // Typically: [No?, Tanggal, Keterangan, Akun, Jenis, Kategori, Nominal]
      let date = getCurrentDateIndo();
      let desc = 'Transaksi';
      let acc = 'cash';
      let type: TransactionType = 'keluar';
      let cat = 'Pribadi';
      let amount = 0;

      // Extract parts intelligently
      for (const p of parts) {
        const amt = parseAmountFromText(p);
        if (amt > 0 && amount === 0) {
          amount = amt;
          continue;
        }
        const detectedD = detectDate(p);
        if (detectedD !== getCurrentDateIndo()) {
          date = detectedD;
          continue;
        }
        const lower = p.toLowerCase();
        if (lower === 'masuk' || lower === 'keluar') {
          type = lower as TransactionType;
          continue;
        }
        const detectedAcc = detectAccount(p, '');
        if (detectedAcc) {
          acc = detectedAcc;
          continue;
        }
        if (Object.keys(CATEGORY_KEYWORDS).includes(p)) {
          cat = p;
          continue;
        }
        if (p.length > 2 && !/^\d+$/.test(p)) {
          desc = p;
        }
      }

      if (amount > 0) {
        results.push({
          date,
          description: desc,
          accountId: acc || 'cash',
          type,
          category: cat,
          amount,
          confidence: 0.95,
          rawText: line,
        });
        continue;
      }
    }

    // Default smart sentence parser
    const parsed = parseSmartSentence(line);
    if (parsed.amount > 0) {
      results.push(parsed);
    }
  }

  return results;
};
