// api/ai-parse-debt.ts
import { neon } from '@neondatabase/serverless';
import { GoogleGenAI } from '@google/genai';

export const config = { maxDuration: 60 };

function extractJSON(raw: string): any | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  try { return JSON.parse(trimmed); } catch {}

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch {}
  }

  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {
      const cleaned = objMatch[0].replace(/,\s*([}\]])/g, '$1');
      try { return JSON.parse(cleaned); } catch {}
    }
  }

  const arrMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { const arr = JSON.parse(arrMatch[0]); return { debts: arr }; } catch {}
  }

  return null;
}

function buildDebtPrompt(today: string, hasImage: boolean): string {
  return [
    `Kamu adalah asisten pencatat utang/piutang. Ubah ${hasImage ? 'foto nota/catatan dan/atau teks' : 'teks'} yang diberikan menjadi daftar utang atau piutang.`,
    '',
    `Tanggal hari ini: ${today} (zona waktu WIB).`,
    '',
    'ATURAN:',
    '1. "utang" = saya berutang ke orang lain. "piutang" = orang lain berutang ke saya.',
    '2. totalAmount = bilangan bulat Rupiah tanpa titik/koma. "5jt"=5000000, "500rb"=500000, "1,5jt"=1500000, "Rp 30.000.000"=30000000.',
    '3. name = nama utang/piutang singkat (mis. "Motor Vario", "Angsur Tanah", "Pinjam Ali"). Maks 1-3 kata.',
    '4. counterparty = nama orang/tempat/bank yang memberi/menerima (mis. "Dealer Honda", "Abah", "Ali"). Boleh kosong.',
    '5. startDate = format YYYY-MM-DD. Kalau tidak ada, pakai tanggal hari ini.',
    '6. dueDate = format YYYY-MM-DD, atau null kalau tidak ada jatuh tempo.',
    '7. installmentAmount = cicilan per bulan (angka), atau null.',
    '8. installmentPeriod = jumlah cicilan total (angka), atau null.',
    '9. notes = catatan tambahan seperti bunga/DP/keterangan lain (string), atau null.',
    hasImage
      ? '10. Jika gambar adalah tabel angsuran: baca Total Pinjam sebagai totalAmount, dan Jatuh Tempo sebagai dueDate. Nama diambil dari judul tabel.'
      : '',
    '11. Jika tidak ada data yang bisa dibaca, kembalikan array kosong [].',
    '',
    'Balas HANYA JSON dengan format: {"debts": [...]}',
  ].filter(Boolean).join('\n');
}

const responseSchema = {
  type: 'OBJECT',
  properties: {
    debts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['utang', 'piutang'] },
          name: { type: 'STRING' },
          counterparty: { type: 'STRING' },
          totalAmount: { type: 'INTEGER' },
          startDate: { type: 'STRING' },
          dueDate: { type: 'STRING' },
          installmentAmount: { type: 'INTEGER' },
          installmentPeriod: { type: 'INTEGER' },
          notes: { type: 'STRING' },
        },
        required: ['type', 'name', 'totalAmount', 'startDate'],
      },
    },
  },
  required: ['debts'],
};

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'GEMINI_API_KEY belum diisi di Vercel. Isi dulu lalu Redeploy.',
      });
    }

    const { text, imageBase64, mimeType } = req.body || {};
    if (!text && !imageBase64) {
      return res.status(400).json({ success: false, error: 'Kirim teks atau gambar.' });
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const promptText = buildDebtPrompt(today, Boolean(imageBase64));

    // Siapkan parts untuk Gemini
    const parts: any[] = [];
    if (imageBase64) {
      const cleanBase64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: cleanBase64,
        },
      });
    }
    parts.push({ text: promptText });
    if (text && text.trim()) {
      parts.push({ text: `TEKS INPUT:\n${text.trim()}` });
    }

    // ============ 1. Deteksi model aktif ============
    let activeModels: string[] = [];
    try {
      const mRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );
      if (mRes.ok) {
        const mData = await mRes.json();
        activeModels = (mData.models || [])
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => String(m.name || '').replace(/^models\//, ''));
        console.log('Model aktif:', activeModels.join(', '));
      } else {
        console.warn('Gagal list model:', mRes.status);
      }
    } catch (e) {
      console.warn('List models error:', e);
    }

    // Urutkan kandidat model: prioritas ke model flash aktif
    const preferredList = [
      process.env.GEMINI_MODEL?.trim(),
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-2.5-pro',
    ].filter(Boolean) as string[];

    const candidateModels = Array.from(
      new Set([
        ...preferredList.filter(m => activeModels.length === 0 || activeModels.includes(m)),
        ...activeModels.filter(m => m.includes('flash')),
        ...activeModels,
        ...preferredList,
      ])
    ).filter(m => m && !m.includes('1.5') && !m.includes('2.0'));

    console.log('Kandidat model:', candidateModels.join(', '));

    let raw = '';
    let lastErrorMsg = '';

    // ============ 2. Metode SDK GoogleGenAI ============
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      for (const modelToTry of candidateModels) {
        try {
          const aiRes = await ai.models.generateContent({
            model: modelToTry,
            contents: { parts },
            config: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema,
            },
          });

          const textVal =
            aiRes?.text ||
            (aiRes?.candidates?.[0]?.content?.parts || [])
              .map((p: any) => p.text || '')
              .join('');

          if (textVal) {
            raw = textVal;
            console.log(`✅ SDK berhasil dengan model: ${modelToTry}`);
            break;
          }
        } catch (sdkErr: any) {
          console.error(`SDK error ${modelToTry}:`, sdkErr?.message);
          lastErrorMsg = sdkErr.message || String(sdkErr);
          continue;
        }
      }
    } catch (sdkInitErr) {
      console.error('SDK init error:', sdkInitErr);
    }

    // ============ 3. Fallback REST API ============
    if (!raw) {
      for (const modelToTry of candidateModels) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);
        try {
          const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToTry}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const gRes = await fetch(restUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                responseSchema,
              },
            }),
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (gRes.ok) {
            const gJson: any = await gRes.json();
            raw = (gJson?.candidates?.[0]?.content?.parts || [])
              .map((p: any) => p.text || '')
              .join('');
            if (raw) {
              console.log(`✅ REST berhasil dengan model: ${modelToTry}`);
              break;
            }
          } else {
            const errText = await gRes.text();
            console.error(`REST error ${modelToTry}:`, gRes.status, errText);
            lastErrorMsg = `Gemini (${gRes.status}): ${errText.slice(0, 160)}`;
          }
        } catch (fetchErr: any) {
          clearTimeout(timer);
          lastErrorMsg = fetchErr.name === 'AbortError'
            ? 'Koneksi ke Gemini timeout.'
            : fetchErr.message;
          continue;
        }
      }
    }

    if (!raw) {
      return res.status(502).json({
        success: false,
        error: lastErrorMsg || 'Gagal memproses dengan Gemini. Periksa API Key & quota.',
      });
    }

    // ============ 4. Parse JSON ============
    const parsed = extractJSON(raw);
    if (!parsed) {
      console.error('Raw response tidak bisa diparse:', raw.slice(0, 500));
      return res.status(200).json({
        success: true,
        debts: [],
        _warning: 'AI tidak mengembalikan JSON valid.',
      });
    }

    let rawDebts: any[] = [];
    if (Array.isArray(parsed)) rawDebts = parsed;
    else if (Array.isArray(parsed.debts)) rawDebts = parsed.debts;
    else if (typeof parsed === 'object' && parsed.name && parsed.totalAmount) {
      rawDebts = [parsed];
    }

    const debts = rawDebts
      .slice(0, 50)
      .map((d: any) => ({
        type: d.type === 'piutang' ? 'piutang' : 'utang',
        name: String(d.name || '').trim().slice(0, 100),
        counterparty: String(d.counterparty || '').trim().slice(0, 100),
        totalAmount: Math.abs(Math.round(Number(d.totalAmount) || 0)),
        startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(d.startDate || ''))
          ? d.startDate
          : today,
        dueDate: d.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(String(d.dueDate))
          ? d.dueDate
          : undefined,
        installmentAmount: d.installmentAmount
          ? Math.abs(Math.round(Number(d.installmentAmount)))
          : undefined,
        installmentPeriod: d.installmentPeriod
          ? Math.round(Number(d.installmentPeriod))
          : undefined,
        notes: d.notes ? String(d.notes).trim().slice(0, 500) : undefined,
      }))
      .filter((d: any) => d.name && d.totalAmount > 0);

    return res.status(200).json({ success: true, debts });
  } catch (e: any) {
    console.error('AI parse debt error:', e);
    return res.status(500).json({
      success: false,
      error: e.message || 'Internal Server Error',
    });
  }
}
