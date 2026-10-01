import { apiAiParse, AiParsedItem } from './api.ts';
import { ParsedTransactionResult } from './autoParser.ts';

const MAX_SIDE = 1600;

// Kecilkan foto agar muat di batas upload server dan lebih cepat diproses AI
export const compressImage = (
  file: File
): Promise<{ base64: string; mimeType: string; preview: string }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Browser tidak mendukung pemrosesan foto.'));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', preview: dataUrl });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('File bukan foto yang valid (format HEIC dari iPhone belum didukung).'));
    };

    img.src = url;
  });

const toResults = (items: AiParsedItem[]): ParsedTransactionResult[] =>
  items.map(it => ({
    date: it.date,
    description: it.description,
    accountId: it.accountId,
    type: it.type,
    category: it.category,
    amount: it.amount,
    transferTargetAccountId: it.transferToAccountId || undefined,
    confidence: 0.95,
    rawText: '',
  }));

// Teks bebas / paste banyak baris -> daftar transaksi
export const parseTextWithGemini = async (text: string): Promise<ParsedTransactionResult[]> =>
  toResults(await apiAiParse({ text }));

// Foto struk -> daftar transaksi (base64 boleh dengan atau tanpa awalan "data:...")
export const parseReceiptWithGemini = async (
  base64: string,
  mimeType: string = 'image/jpeg'
): Promise<ParsedTransactionResult[]> =>
  toResults(await apiAiParse({ imageBase64: base64, mimeType }));