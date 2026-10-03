// api/ai-parse-debt.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Coba parse JSON dari string yang mungkin mengandung teks lain.
 * Strategi: coba JSON.parse → strip markdown → cari objek { } pertama → cari array [ ] pertama.
 */
function extractJSON(raw: string): any | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // 1. Coba langsung
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Strip markdown code fence ```json ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {}
  }

  // 3. Cari objek JSON pertama {...}
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // kadang ada koma trailing: coba bersihkan
      const cleaned = objMatch[0]
        .replace(/,\s*([}\]])/g, '$1') // hapus koma sebelum } atau ]
        .replace(/[\u0000-\u001F]+/g, ' '); // hapus control char
      try {
        return JSON.parse(cleaned);
      } catch {}
    }
  }

  // 4. Cari array JSON pertama [...]
  const arrMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      return { debts: arr };
    } catch {}
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { text, imageBase64, mimeType } = req.body;

    if (!text && !imageBase64) {
      return res.status(400).json({ success: false, error: 'Kirim teks atau gambar.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'GEMINI_API_KEY belum diset.' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Prompt super tegas agar AI hanya balas JSON
    const promptText = `Tugas: ekstrak data utang/piutang dari input user menjadi JSON.

ATURAN OUTPUT (WAJIB):
- Balas HANYA JSON, tanpa penjelasan, tanpa markdown, tanpa code fence.
- Format: {"debts": [ ... ]}
- Jika tidak ada data, balas: {"debts": []}

ATURAN DATA:
- "utang" = saya berutang ke orang lain. "piutang" = orang berutang ke saya.
- Nominal: "5jt"=5000000, "500rb"=500000, "1,5jt"=1500000. Hapus titik/koma pemisah ribuan.
- Tanggal hari ini: ${today}. Kalau tidak ada tanggal, pakai tanggal hari ini.
- Kalau ada "jatuh tempo", isi dueDate (format YYYY-MM-DD).
- Kalau ada cicilan/angsuran, isi installmentAmount dan installmentPeriod.

SKEMA:
{"debts":[{
  "type":"utang"|"piutang",
  "name":"string",
  "counterparty":"string",
  "totalAmount":number,
  "startDate":"YYYY-MM-DD",
  "dueDate":"YYYY-MM-DD"|null,
  "installmentAmount":number|null,
  "installmentPeriod":number|null,
  "notes":"string"|null
}]}`;

    const parts: any[] = [{ text: promptText }];

    if (imageBase64) {
      parts.push({ text: 'Gambar ini berisi catatan utang/piutang. Ekstrak datanya.' });
      parts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBase64,
        },
      });
    } else {
      parts.push({ text: `Teks:\n${text.trim()}` });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini HTTP error:', geminiRes.status, errText);
      return res.status(500).json({
        success: false,
        error: `Gemini error (${geminiRes.status}). Periksa API key & quota.`,
      });
    }

    const geminiJson = await geminiRes.json();
    const rawText: string =
      geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('=== GEMINI RAW RESPONSE ===');
    console.log(rawText.slice(0, 2000)); // log 2000 char pertama untuk debug
    console.log('=== END RAW ===');

    if (!rawText) {
      return res.status(200).json({
        success: true,
        debts: [],
        _warning: 'Gemini mengembalikan respons kosong.',
      });
    }

    const parsed = extractJSON(rawText);
    if (!parsed) {
      console.error('Gagal parse JSON. Raw response:', rawText);
      return res.status(200).json({
        success: true,
        debts: [],
        _warning: 'AI tidak mengembalikan JSON valid. Coba teks yang lebih jelas.',
      });
    }

    // Normalisasi
    let rawDebts: any[] = [];
    if (Array.isArray(parsed)) rawDebts = parsed;
    else if (Array.isArray(parsed.debts)) rawDebts = parsed.debts;
    else if (typeof parsed === 'object' && parsed.name && parsed.totalAmount) {
      // AI kadang balas objek tunggal, bukan array
      rawDebts = [parsed];
    }

    const debts = rawDebts
      .map((d: any) => ({
        type: d.type === 'piutang' ? 'piutang' : 'utang',
        name: String(d.name || '').trim(),
        counterparty: String(d.counterparty || '').trim(),
        totalAmount: Math.abs(Number(d.totalAmount) || 0),
        startDate: d.startDate || today,
        dueDate: d.dueDate || undefined,
        installmentAmount: d.installmentAmount ? Math.abs(Number(d.installmentAmount)) : undefined,
        installmentPeriod: d.installmentPeriod ? Number(d.installmentPeriod) : undefined,
        notes: d.notes || undefined,
      }))
      .filter((d: any) => d.name && d.totalAmount > 0);

    return res.status(200).json({ success: true, debts });
  } catch (e: any) {
    console.error('AI parse debt error:', e);
    return res.status(500).json({ success: false, error: e.message || 'Server error' });
  }
}
