import { Transaction, Account } from '../types/finance.ts';

export const isCatTransfer = (t: Transaction) => t.id.startsWith('kt-');
export const isAccTransfer = (t: Transaction) => t.category === 'Pindah Saldo';

export const HEADERS = ['No', 'Tanggal', 'Keterangan', 'Akun', 'Jenis', 'Kategori', 'Nominal', 'Catatan'];

export interface SummaryItem {
  label: string;
  value?: number;
  type: 'masuk' | 'keluar' | 'sisa' | 'section' | 'acc-header' | 'acc-masuk' | 'acc-keluar' | 'info';
}

// Helper untuk memicu unduhan file secara andal di semua peramban
export const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 250);
};

// Pembuat format HTML Spreadsheet Microsoft Excel Native (.xls)
export const buildExcelXmlHtml = (
  headers: string[],
  rows: (string | number)[][],
  summaryItems?: SummaryItem[],
  sheetName = 'Transaksi Toko'
) => {
  const totalRowsCount = summaryItems ? Math.max(rows.length, summaryItems.length) : rows.length;
  const tbodyRows: string[] = [];

  for (let i = 0; i < totalRowsCount; i++) {
    const r = rows[i];
    let rowHtml = '';
    if (r) {
      rowHtml += `
        <td class="center">${r[0]}</td>
        <td class="center text">${r[1]}</td>
        <td>${r[2]}</td>
        <td>${r[3]}</td>
        <td class="center">${r[4]}</td>
        <td>${r[5]}</td>
        <td class="num">${r[6]}</td>
        <td>${r[7] || ''}</td>
      `;
    } else {
      rowHtml += `
        <td class="center"></td>
        <td class="center text"></td>
        <td></td>
        <td></td>
        <td class="center"></td>
        <td></td>
        <td class="num"></td>
        <td></td>
      `;
    }

    if (summaryItems) {
      // Kolom pemisah (Kolom I)
      rowHtml += `<td style="border:none;background:transparent;width:20px;"></td>`;

      const item = summaryItems[i];
      if (item) {
        if (item.type === 'section') {
          rowHtml += `<td colspan="2" class="sum-section">${item.label}</td>`;
        } else if (item.type === 'masuk') {
          rowHtml += `
            <td class="sum-masuk">${item.label}</td>
            <td class="num sum-masuk">${item.value ?? 0}</td>
          `;
        } else if (item.type === 'keluar') {
          rowHtml += `
            <td class="sum-keluar">${item.label}</td>
            <td class="num sum-keluar">${item.value ?? 0}</td>
          `;
        } else if (item.type === 'sisa') {
          const val = item.value ?? 0;
          rowHtml += `
            <td class="sum-sisa">${item.label}</td>
            <td class="num sum-sisa" style="color:${val >= 0 ? '#047857' : '#be123c'};">${val}</td>
          `;
        } else if (item.type === 'acc-header') {
          rowHtml += `
            <td class="sum-acc-title" style="font-weight:bold;background-color:#f8fafc;color:#1e3a5f;">${item.label}</td>
            <td class="sum-acc-title" style="background-color:#f8fafc;"></td>
          `;
        } else if (item.type === 'acc-masuk') {
          rowHtml += `
            <td class="sum-acc-sub" style="padding-left:16px;">Masuk</td>
            <td class="num sum-acc-sub" style="color:#047857;font-weight:bold;">${item.value ?? 0}</td>
          `;
        } else if (item.type === 'acc-keluar') {
          rowHtml += `
            <td class="sum-acc-sub" style="padding-left:16px;">Keluar</td>
            <td class="num sum-acc-sub" style="color:#be123c;font-weight:bold;">${item.value ?? 0}</td>
          `;
        } else if (item.type === 'info') {
          rowHtml += `
            <td class="sum-acc-sub" style="padding-left:16px;color:#0284c7;font-style:italic;">${item.label}</td>
            <td class="num sum-acc-sub" style="color:#0284c7;font-weight:bold;">${item.value ?? 0}</td>
          `;
        }
      } else {
        rowHtml += `
          <td style="border:none;background:transparent;"></td>
          <td style="border:none;background:transparent;"></td>
        `;
      }
    }

    tbodyRows.push(`<tr>${rowHtml}</tr>`);
  }

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>${sheetName}</x:Name>
          <x:WorksheetOptions>
            <x:DisplayGridlines/>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    th { background-color: #1e3a5f; color: #ffffff; font-weight: bold; border: 0.5pt solid #999999; padding: 6px 12px; text-align: center; }
    td { border: 0.5pt solid #cccccc; padding: 5px 8px; font-family: Calibri, sans-serif; font-size: 11pt; }
    .center { text-align: center; }
    .num { text-align: right; mso-number-format:"\\#\\,\\#\\#0"; }
    .text { mso-number-format:"\\@"; }
    .sum-header { background-color: #0f2744; color: #ffffff; font-weight: bold; border: 0.5pt solid #0f2744; padding: 6px 12px; }
    .sum-section { background-color: #e2e8f0; color: #1e293b; font-weight: bold; border: 0.5pt solid #cbd5e1; padding: 5px 8px; text-align: center; font-size: 10pt; }
    .sum-masuk { font-weight: bold; background-color: #ecfdf5; color: #047857; border: 0.5pt solid #a7f3d0; padding: 5px 10px; }
    .sum-keluar { font-weight: bold; background-color: #fff1f2; color: #be123c; border: 0.5pt solid #fecdd3; padding: 5px 10px; }
    .sum-sisa { font-weight: bold; background-color: #f1f5f9; color: #0f172a; border: 0.5pt solid #cbd5e1; padding: 5px 10px; }
    .sum-acc-title { font-weight: bold; background-color: #f8fafc; color: #1e3a5f; border: 0.5pt solid #cbd5e1; padding: 5px 10px; }
    .sum-acc-sub { color: #475569; background-color: #ffffff; border: 0.5pt solid #e2e8f0; padding: 4px 8px 4px 16px; font-size: 10pt; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>
        ${headers.map(h => `<th>${h}</th>`).join('')}
        ${
          summaryItems
            ? `
          <th style="background-color:#ffffff;border:none;width:20px;"></th>
          <th class="sum-header" style="text-align:left;">Ringkasan</th>
          <th class="sum-header" style="text-align:right;">Jumlah (Rp)</th>
        `
            : ''
        }
      </tr>
    </thead>
    <tbody>
      ${tbodyRows.join('')}
    </tbody>
  </table>
</body>
</html>`;
};

// Fungsi ekspor langsung ke Excel (.xls) tanpa perlu modal
export const exportDirectToExcel = (
  transactionsToExport: Transaction[],
  accounts: Account[],
  customFilename?: string
): boolean => {
  if (!transactionsToExport || transactionsToExport.length === 0) {
    return false;
  }

  // 1. Pemasukan & Pengeluaran Riil (mutasi internal tidak menggandakan omset/biaya toko)
  const realMasuk = transactionsToExport
    .filter(t => t.type === 'masuk' && !isAccTransfer(t) && !isCatTransfer(t))
    .reduce((sum, t) => sum + t.amount, 0);

  const realKeluar = transactionsToExport
    .filter(t => t.type === 'keluar' && !isAccTransfer(t) && !isCatTransfer(t))
    .reduce((sum, t) => sum + t.amount, 0);

  const sisa = realMasuk - realKeluar;

  // Mutasi internal
  const totalPindahKategori = transactionsToExport
    .filter(t => isCatTransfer(t) && t.type === 'keluar')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPindahSaldo = transactionsToExport
    .filter(t => isAccTransfer(t) && t.type === 'keluar')
    .reduce((sum, t) => sum + t.amount, 0);

  const summaryItems: SummaryItem[] = [
    { label: 'Pemasukan Riil Toko', value: realMasuk, type: 'masuk' },
    { label: 'Pengeluaran Riil Toko', value: realKeluar, type: 'keluar' },
    { label: 'Sisa / Laba Bersih', value: sisa, type: 'sisa' },
  ];

  if (totalPindahKategori > 0 || totalPindahSaldo > 0) {
    summaryItems.push({ label: 'MUTASI INTERNAL', type: 'section' });
    if (totalPindahKategori > 0) {
      summaryItems.push({ label: 'Pindah Kategori', value: totalPindahKategori, type: 'info' });
    }
    if (totalPindahSaldo > 0) {
      summaryItems.push({ label: 'Pindah Saldo Antar Akun', value: totalPindahSaldo, type: 'info' });
    }
  }

  // Rekap per Kantong (Kategori)
  const catMap = new Map<string, { masuk: number; keluar: number; pindah: number }>();
  transactionsToExport.forEach(t => {
    if (isAccTransfer(t)) return;
    const key = t.category && t.category.trim() && t.category !== '-' ? t.category : 'Tanpa Kategori';
    const row = catMap.get(key) || { masuk: 0, keluar: 0, pindah: 0 };
    if (isCatTransfer(t)) {
      row.pindah += t.type === 'masuk' ? t.amount : -t.amount;
    } else if (t.type === 'masuk') {
      row.masuk += t.amount;
    } else {
      row.keluar += t.amount;
    }
    catMap.set(key, row);
  });

  const categoryBreakdown = Array.from(catMap.entries())
    .map(([name, data]) => ({
      name,
      masuk: data.masuk,
      keluar: data.keluar,
      pindah: data.pindah,
      saldo: data.masuk - data.keluar + data.pindah,
    }))
    .filter(c => c.masuk > 0 || c.keluar > 0 || c.pindah !== 0);

  if (categoryBreakdown.length > 0) {
    summaryItems.push({ label: 'REKAP PER KANTONG (KATEGORI)', type: 'section' });
    categoryBreakdown.forEach(cat => {
      summaryItems.push({ label: cat.name, type: 'acc-header' });
      if (cat.masuk > 0) summaryItems.push({ label: '  Masuk', value: cat.masuk, type: 'acc-masuk' });
      if (cat.keluar > 0) summaryItems.push({ label: '  Keluar', value: cat.keluar, type: 'acc-keluar' });
      if (cat.pindah !== 0) {
        summaryItems.push({
          label: `  Mutasi Pindah (${cat.pindah > 0 ? '+' : ''})`,
          value: cat.pindah,
          type: 'info',
        });
      }
      summaryItems.push({ label: '  Saldo Kantong', value: cat.saldo, type: 'sisa' });
    });
  }

  // Rekap per Akun
  const accountBreakdown = accounts
    .map(acc => {
      const m = transactionsToExport
        .filter(t => t.accountId === acc.id && t.type === 'masuk' && !isCatTransfer(t))
        .reduce((s, t) => s + t.amount, 0);
      const k = transactionsToExport
        .filter(t => t.accountId === acc.id && t.type === 'keluar' && !isCatTransfer(t))
        .reduce((s, t) => s + t.amount, 0);
      const count = transactionsToExport.filter(t => t.accountId === acc.id).length;
      return {
        id: acc.id,
        name: acc.name,
        masuk: m,
        keluar: k,
        sisa: m - k,
        count,
      };
    })
    .filter(a => a.count > 0);

  if (accountBreakdown.length > 0) {
    summaryItems.push({ label: 'TOTAL PER AKUN', type: 'section' });
    accountBreakdown.forEach(acc => {
      summaryItems.push({ label: acc.name, type: 'acc-header' });
      summaryItems.push({ label: '  Masuk', value: acc.masuk, type: 'acc-masuk' });
      summaryItems.push({ label: '  Keluar', value: acc.keluar, type: 'acc-keluar' });
      summaryItems.push({ label: '  Selisih', value: acc.sisa, type: 'sisa' });
    });
  }

  const rows = transactionsToExport.map((t, idx) => {
    const acc = accounts.find(a => a.id === t.accountId)?.name || t.accountId;
    let jenisText = t.type === 'masuk' ? 'Masuk' : 'Keluar';
    let catatanText = t.notes || '';

    if (isCatTransfer(t)) {
      jenisText = t.type === 'masuk' ? 'Pindah Kategori (Masuk)' : 'Pindah Kategori (Keluar)';
      catatanText = catatanText ? `${catatanText} [Pindah Kategori]` : '[Pindah Kategori]';
    } else if (isAccTransfer(t)) {
      jenisText = t.type === 'masuk' ? 'Pindah Saldo (Masuk)' : 'Pindah Saldo (Keluar)';
      catatanText = catatanText ? `${catatanText} [Pindah Saldo]` : '[Pindah Saldo]';
    }

    return [
      t.no || idx + 1,
      t.date,
      t.description,
      acc,
      jenisText,
      t.category || '-',
      t.amount,
      catatanText,
    ];
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const filename = customFilename || `dompet_toko_filter_${todayStr}.xls`;

  const excelHtml = buildExcelXmlHtml(HEADERS, rows, summaryItems, 'Buku Kas Toko');
  const blob = new Blob(['\uFEFF' + excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, filename);
  return true;
};
