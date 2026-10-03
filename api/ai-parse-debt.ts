import type { VercelRequest, VercelResponse } from '@vercel/node';

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

    const promptText = `
Kamu adalah asisten pencatat utang/piutang. Baca input (teks atau gambar nota/struk) dan ubah menjadi JSON array.
Tanggal hari ini: ${today}.

Aturan:
- "utang" = saya berutang ke orang lain
- "piutang" = orang lain berutang ke saya
- Format nominal: "5jt" = 5000000, "500rb" = 500000, "1m" = 1000000000
- Jika tidak jelas tanggal mulai, pakai tanggal hari ini
- Jika ada "jatuh tempo", isi dueDate
- Jika ada "cicilan" atau "angsuran", isi installmentAmount dan installmentPeriod

Format output JSON:
{
  "debts": [
    {
      "type": "utang" | "piutang",
      "name": "nama utang (mis. Motor Vario)",
      "counterparty": "nama orang/tempat",
      "totalAmount": 5000000,
      "startDate": "2026-10-03",
      "dueDate": "2027-10-03",
      "installmentAmount": 500000,
      "installmentPeriod": 12,
      "notes": "catatan tambahan (opsional)"
    }
  ]
}

Balas HANYA JSON, tanpa penjelasan.
`;

    // Siapkan parts untuk Gemini
    const parts: any[] = [{ text: promptText }];

    if (imageBase64) {
      parts.push({
        text: '\n\nTeks / nota yang perlu dianalisis:',
      });
      parts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBase64,
        },
      });
    } else {
      parts.push({
        text: `\n\nTeks:\n"""\n${text.trim()}\n"""`,
      });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      }
    );

    const geminiJson = await geminiRes.json();
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('AI tidak mengembalikan JSON valid.');
    }

    const debts = (parsed.debts || []).map((d: any) => ({
      type: d.type === 'piutang' ? 'piutang' : 'utang',
      name: String(d.name || '').trim(),
      counterparty: String(d.counterparty || '').trim(),
      totalAmount: Number(d.totalAmount) || 0,
      startDate: d.startDate || today,
      dueDate: d.dueDate || undefined,
      installmentAmount: d.installmentAmount ? Number(d.installmentAmount) : undefined,
      installmentPeriod: d.installmentPeriod ? Number(d.installmentPeriod) : undefined,
      notes: d.notes || undefined,
    })).filter((d: any) => d.name && d.totalAmount > 0);

    return res.status(200).json({ success: true, debts });
  } catch (e: any) {
    console.error('AI parse debt error:', e);
    return res.status(500).json({ success: false, error: e.message || 'Server error' });
  }
}