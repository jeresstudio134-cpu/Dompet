export const formatRupiah = (amount: number): string => {
  const rounded = Math.round(amount || 0);
  return 'Rp' + rounded.toLocaleString('id-ID');
};

export const formatRupiahCompact = (amount: number): string => {
  if (Math.abs(amount) >= 1_000_000_000) {
    return `Rp ${(amount / 1_000_000_000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1_000_000) {
    return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `Rp ${(amount / 1_000).toFixed(0)}rb`;
  }
  return formatRupiah(amount);
};

export const parseRupiahInput = (input: string | number): number => {
  if (typeof input === 'number') return Math.max(0, input);
  if (!input) return 0;
  // Remove Rp, commas, dots, whitespace
  const clean = input.toString().replace(/[^0-9]/g, '');
  return parseInt(clean, 10) || 0;
};

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const formatTanggalIndo = (dateStr: string, withYear = true): string => {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!month || !day) return dateStr;
    const bulan = NAMA_BULAN[month - 1] || '';
    return withYear ? `${day} ${bulan} ${year}` : `${day} ${bulan}`;
  } catch {
    return dateStr;
  }
};

export const getMonthYearLabel = (monthYearStr: string): string => {
  if (!monthYearStr || monthYearStr === 'ALL') return 'Semua Periode';
  const [year, month] = monthYearStr.split('-').map(Number);
  if (!month || !year) return monthYearStr;
  return `${NAMA_BULAN[month - 1]} ${year}`;
};

export const getMonthYearOptions = (transactions: { date: string }[]): { value: string; label: string }[] => {
  const set = new Set<string>();
  
  // Default months around July 2026 as seen in user's sheet
  set.add('2026-08');
  set.add('2026-07');
  set.add('2026-06');

  transactions.forEach(t => {
    if (t.date && t.date.length >= 7) {
      set.add(t.date.substring(0, 7));
    }
  });

  const sorted = Array.from(set).sort((a, b) => b.localeCompare(a));
  return [
    { value: 'ALL', label: 'Semua Periode (Semua Bulan)' },
    ...sorted.map(m => ({ value: m, label: getMonthYearLabel(m) }))
  ];
};

export const getCurrentDateIndo = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
