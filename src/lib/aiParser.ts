import { GoogleGenAI } from '@google/genai';
import { ParsedTransactionResult } from './autoParser.ts';
import { getCurrentDateIndo } from '../utils/formatters.ts';

export const parseReceiptWithGemini = async (
  imageBase64: string,
  mimeType = 'image/jpeg'
): Promise<ParsedTransactionResult[]> => {
  const apiKey = process.env.GEMINI_API_KEY || (window as any).__GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY tidak ditemukan. Fitur analisis struk AI memerlukan konfigurasi Gemini API Key.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Kamu adalah asisten keuangan pribadi & toko profesional di Indonesia.
Analisis gambar struk belanja / invoice / bukti transfer ini.
Ekstrak semua transaksi yang tercatat dan kembalikan HANYA JSON array murni tanpa markdown formatting atau pembungkus \`\`\`json.

Format JSON array yang diharapkan:
[
  {
    "date": "YYYY-MM-DD",
    "description": "Nama item atau toko (contoh: Semen Gresik / Indomaret / Bensin Pertalite)",
    "accountId": "cash" atau "dana" atau "seabank" atau "shoopepay",
    "type": "keluar" atau "masuk",
    "category": "Pribadi" atau "Pokok" atau "Kendaraan" atau "Bangun Rumah" atau "Operasional Toko" atau "Pemasukan Toko",
    "amount": 25000,
    "confidence": 0.95
  }
]

Panduan:
- Jika tanggal tidak tertera di struk, gunakan tanggal hari ini: ${getCurrentDateIndo()}.
- Nominal harus berupa bilangan bulat positif angka (Rupiah).
- Pilih accountId yang paling mendekati dari metode pembayaran di struk (cash / dana / seabank / shoopepay). Jika tunai, gunakan "cash".
- Pilih kategori yang paling cocok dari daftar kategori di atas.`;

  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          },
        ],
      },
    ],
  });

  const responseText = response.text || '';
  const jsonClean = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(jsonClean);
    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        date: item.date || getCurrentDateIndo(),
        description: item.description || 'Pengeluaran Struk',
        accountId: item.accountId || 'cash',
        type: item.type === 'masuk' ? 'masuk' : 'keluar',
        category: item.category || 'Pribadi',
        amount: Number(item.amount) || 0,
        confidence: item.confidence || 0.9,
        rawText: `Struk OCR: ${item.description} - Rp ${item.amount}`,
      }));
    }
  } catch (err) {
    console.error('Failed to parse Gemini receipt response:', responseText, err);
  }

  throw new Error('Gagal mengekstrak data transaksi dari struk. Pastikan foto struk terlihat jelas dan coba lagi.');
};
