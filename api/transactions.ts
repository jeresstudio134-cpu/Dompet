import { neon } from '@neondatabase/serverless';
import { GoogleGenAI } from '@google/genai';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export const config = { maxDuration: 60 }; // Gemini bisa butuh >10 detik untuk foto

const DEFAULT_PIN = '1234'; // dipakai sampai admin mengganti PIN
const PUBLIC_SETTINGS = ['store_name']; // hanya key ini yang boleh ditulis lewat entity "setting"
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // sesi admin 12 jam
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ---------- Keamanan: token admin & PIN ----------

const getSecret = () =>
  process.env.AUTH_SECRET || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';

function signToken(): string {
  const expiry = String(Date.now() + TOKEN_TTL_MS);
  const sig = createHmac('sha256', getSecret()).update(expiry).digest('hex');
  return `${expiry}.${sig}`;
}

function verifyToken(token?: string): boolean {
  if (!token || !getSecret()) return false;
  const [expiry, sig] = token.split('.');
  if (!expiry || !sig) return false;
  const expected = createHmac('sha256', getSecret()).update(expiry).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(expiry) > Date.now();
}

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 32).toString('hex');
}

async function verifyPin(sql: any, pin: string): Promise<boolean> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'admin_pin' LIMIT 1`;
  if (rows.length === 0) return pin === DEFAULT_PIN;
  const [salt, hash] = String(rows[0].value).split(':');
  const a = Buffer.from(hashPin(pin, salt));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function savePin(sql: any, pin: string) {
  const salt = randomBytes(16).toString('hex');
  const value = `${salt}:${hashPin(pin, salt)}`;
  await sql`
    INSERT INTO settings (key, value, updated_at) VALUES ('admin_pin', ${value}, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
  `;
  await sql`
    INSERT INTO settings (key, value, updated_at) VALUES ('admin_pin_len', ${String(pin.length)}, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
  `;
}

// Pembatasan percobaan login: 5 kali salah = terkunci 5 menit. Mengembalikan sisa menit (0 = tidak terkunci)
async function getLoginLock(sql: any): Promise<number> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'login_fail' LIMIT 1`;
  if (rows.length === 0) return 0;
  const [count, ts] = String(rows[0].value).split(':').map(Number);
  if (count >= MAX_FAILS) {
    const remaining = ts + LOCK_MS - Date.now();
    if (remaining > 0) return Math.ceil(remaining / 60000);
  }
  return 0;
}

async function registerLoginFail(sql: any) {
  const rows = await sql`SELECT value FROM settings WHERE key = 'login_fail' LIMIT 1`;
  let count = 0;
  if (rows.length > 0) {
    const [c, ts] = String(rows[0].value).split(':').map(Number);
    count = Date.now() - ts > LOCK_MS ? 0 : c;
  }
  const value = `${count + 1}:${Date.now()}`;
  await sql`
    INSERT INTO settings (key, value, updated_at) VALUES ('login_fail', ${value}, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
  `;
}

async function clearLoginFail(sql: any) {
  await sql`DELETE FROM settings WHERE key = 'login_fail'`;
}

// ---------- AI: prompt Gemini ----------

// Kebiasaan pencatatan (dipakai hanya jika kategorinya memang ada di database)
const CATEGORY_HINTS: { category: string; examples: string }[] = [
  { category: 'Kendaraan', examples: 'bensin, pertalite, pertamax, servis, oli, parkir, tol' },
  { category: 'Pokok', examples: 'listrik, token, wifi, pdam, sembako, beras, kontrakan' },
  { category: 'Bangun Rumah', examples: 'semen, pasir, batu bata, cat, keramik, tukang, material' },
  { category: 'Pribadi', examples: 'makan, bakso, jajan, kopi, rokok, obat' },
  { category: 'Operasional Toko', examples: 'stiker, banner, kertas, tinta, plastik, ongkir' },
  { category: 'Toko', examples: 'pemasukan toko, penjualan, omset' },
  { category: 'Pemasukan Toko', examples: 'pemasukan toko, penjualan, omset' },
];

function buildAiPrompt(accounts: any[], categories: string[], today: string, hasImage: boolean): string {
  const accountList = accounts.map(a => `- id "${a.id}" = ${a.name} (${a.type})`).join('\n');
  const categoryList = categories.length > 0 ? categories.map(c => `- ${c}`).join('\n') : '- (belum ada kategori)';
  const hints = CATEGORY_HINTS
    .filter(h => categories.some(c => c.toLowerCase() === h.category.toLowerCase()))
    .map(h => `- ${h.category}: ${h.examples}`)
    .join('\n');

  return [
    `Kamu adalah asisten pembukuan toko kecil di Indonesia. Ubah ${hasImage ? 'foto struk/nota/catatan dan/atau teks' : 'teks'} yang diberikan menjadi daftar transaksi keuangan.`,
    '',
    `Tanggal hari ini: ${today} (zona waktu WIB).`,
    '',
    'DAFTAR AKUN (accountId HARUS salah satu id ini):',
    accountList,
    '',
    'DAFTAR KATEGORI (prioritaskan dari daftar ini jika sesuai; jika transaksi memiliki konteks spesifik seperti "Angsur Tanah", "Cicilan", "Sewa", "Gaji", dll., kamu BOLEH membuat kategori baru yang singkat dan jelas 1-3 kata):',
    categoryList,
    hints ? `\nKebiasaan pengguna (kata kunci -> kategori):\n${hints}` : '',
    '',
    'ATURAN:',
    '1. Satu transaksi per kejadian uang masuk/keluar. Satu baris teks biasanya satu transaksi. Abaikan teks yang bukan transaksi (sapaan, saldo akhir, nomor referensi, promo).',
    '2. amount = bilangan bulat Rupiah tanpa titik/koma. "30rb" atau "30k" = 30000, "1,5jt" = 1500000, "125.000" = 125000, "Rp 2.500.000,00" = 2500000. Untuk notifikasi bank, pakai nominal transaksi, bukan saldo.',
    '3. type: "keluar" untuk belanja, bayar, beli, tagihan, ongkir; "masuk" untuk pemasukan, penjualan, omset, terima, gaji. Jika ragu, pilih "keluar".',
    '4. accountId: cocokkan nama atau alias yang disebut (mis. "tunai" = akun Cash, "spay" = ShopeePay). Jika tidak disebut, pakai akun bertipe cash; jika tidak ada, akun pertama.',
    `5. date: format YYYY-MM-DD. Pakai tanggal pada teks/struk; "kemarin" = sehari sebelum tanggal hari ini. Jika tahun tidak tertulis, pakai tahun ${today.slice(0, 4)}. Jika tanggal tidak ada, pakai tanggal hari ini.`,
    '6. description: singkat dan jelas, huruf awal kapital, tanpa nominal dan tanpa nama akun (mis. "Bensin", "Bulanan Wifi").',
    '7. Pemindahan saldo antar akun (mis. "pindah 50rb dari seabank ke cash"): SATU entri dengan accountId = akun asal, transferToAccountId = akun tujuan, type "keluar", category "Pindah Saldo". Untuk transaksi biasa, transferToAccountId = "".',
    hasImage
      ? '8. Jika gambar adalah struk/nota belanja: buat SATU transaksi "keluar" dengan total akhir yang dibayar (setelah diskon/pajak); description berisi nama toko dan 1-3 barang utama. Jika gambar adalah catatan atau daftar (mis. tangkapan layar chat/catatan berisi banyak baris bertanggal): buat SATU transaksi per baris, jangan digabung. Teks dalam kurung adalah keterangan atau kategori (mis. "(pokok)" = kategori Pokok).'
      : '',
    '9. Jika tidak ada transaksi yang bisa dibaca, kembalikan array kosong [].',
  ].join('\n');
}

// ---------- Database ----------

let isInitialized = false;

async function ensureTables(sql: any) {
  if (isInitialized) return;
  try {
    // Semua tabel dibuat bersamaan agar cold start tidak lama
    await Promise.all([
      sql`
        CREATE TABLE IF NOT EXISTS accounts (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          type VARCHAR(20) NOT NULL,
          color VARCHAR(20) DEFAULT '#0284c7',
          icon_name VARCHAR(50) DEFAULT 'Wallet',
          initial_balance BIGINT DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `,
      sql`
        CREATE TABLE IF NOT EXISTS transactions (
          id VARCHAR(64) PRIMARY KEY,
          no INTEGER,
          date DATE NOT NULL,
          description VARCHAR(255) NOT NULL,
          account_id VARCHAR(50),
          type VARCHAR(10) NOT NULL,
          category VARCHAR(50) NOT NULL,
          amount BIGINT NOT NULL,
          notes TEXT,
          transfer_target_account_id VARCHAR(50),
          linked_transaction_id VARCHAR(64),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `,
      sql`
        CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(50) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `,
      sql`
        CREATE TABLE IF NOT EXISTS categories (
          name VARCHAR(50) PRIMARY KEY,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `,
    ]);

    await Promise.all([
      sql`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);`,
      sql`CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);`,
    ]);

    isInitialized = true;
  } catch (e) {
    console.error('Error ensuring tables in Neon:', e);
  }
}

export default async function handler(req: any, res: any) {
  // Tanpa CORS: aplikasi dan API berada di domain yang sama
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

  if (!databaseUrl) {
    return res.status(500).json({
      error: 'DATABASE_URL environment variable is missing on Vercel.',
      hint: 'Add DATABASE_URL in Vercel project Settings -> Environment Variables.',
    });
  }

  const sql = neon(databaseUrl);
  await ensureTables(sql);

  const isAdminReq = verifyToken(req.headers['x-admin-token'] as string | undefined);
  const denyAdmin = () =>
    res.status(401).json({ success: false, error: 'Sesi admin berakhir atau tidak valid. Masukkan PIN admin lagi.' });

  try {
    // 1. GET: semua data sekaligus
    if (req.method === 'GET') {
      const [txRows, accRows, catRows, nameRows] = await Promise.all([
        sql`
          SELECT 
            id, 
            no, 
            to_char(date, 'YYYY-MM-DD') as date, 
            description, 
            account_id as "accountId", 
            type, 
            category, 
            amount, 
            notes, 
            transfer_target_account_id as "transferTargetAccountId", 
            linked_transaction_id as "linkedTransactionId", 
            created_at as "createdAt"
          FROM transactions 
          ORDER BY date DESC, no DESC NULLS LAST, id DESC
        `,
        sql`
          SELECT id, name, type, color, icon_name as "iconName", initial_balance as "initialBalance"
          FROM accounts
          ORDER BY id ASC
        `,
        sql`SELECT name FROM categories ORDER BY created_at ASC, name ASC`,
        sql`SELECT value FROM settings WHERE key = 'store_name' LIMIT 1`,
      ]);

      return res.status(200).json({
        success: true,
        categories: catRows.map((c: any) => c.name),
        storeName: nameRows.length > 0 ? nameRows[0].value : null,
        transactions: txRows.map((r: any) => ({
          ...r,
          amount: Number(r.amount) || 0,
          no: r.no ? Number(r.no) : undefined,
        })),
        accounts: accRows.map((a: any) => ({
          ...a,
          initialBalance: Number(a.initialBalance) || 0,
        })),
      });
    }

    // 2. POST / PUT
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = req.body || {};

      // Pencatatan otomatis dengan Gemini (bisa digunakan baik mode Kasir maupun Admin)
      if (body.entity === 'ai_parse') {
        const apiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey) {
          return res.status(500).json({
            success: false,
            error: 'GEMINI_API_KEY belum diisi di Vercel. Pastikan sudah diisi dan sudah di-Redeploy.',
          });
        }

        const text = String(body.text || '').slice(0, 8000);
        const imageBase64 = String(body.imageBase64 || '').replace(/^data:[^;]+;base64,/, '');
        const mimeType = String(body.mimeType || 'image/jpeg');

        if (!text.trim() && !imageBase64) {
          return res.status(400).json({ success: false, error: 'Teks atau foto wajib diisi.' });
        }
        if (imageBase64.length > 4000000) {
          return res.status(413).json({ success: false, error: 'Foto terlalu besar. Gunakan foto yang lebih kecil.' });
        }
        if (imageBase64 && !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
          return res.status(400).json({ success: false, error: 'Format foto harus JPG, PNG, atau WEBP.' });
        }

        const accRows = await sql`SELECT id, name, type FROM accounts ORDER BY id ASC`;
        const catRows = await sql`SELECT name FROM categories ORDER BY name ASC`;
        if (accRows.length === 0) {
          return res.status(400).json({ success: false, error: 'Belum ada akun di database.' });
        }

        const accountIds: string[] = accRows.map((a: any) => a.id);
        const categoryNames: string[] = catRows.map((c: any) => c.name);
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        const parts: any[] = [];
        if (imageBase64) {
          parts.push({ inlineData: { mimeType, data: imageBase64 } });
        }
        parts.push({ text: buildAiPrompt(accRows, categoryNames, today, Boolean(imageBase64)) });
        if (text.trim()) {
          parts.push({ text: `TEKS INPUT:\n${text}` });
        }

        const responseSchema = {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              date: { type: 'STRING' },
              description: { type: 'STRING' },
              accountId: { type: 'STRING', enum: accountIds },
              type: { type: 'STRING', enum: ['masuk', 'keluar'] },
              category: { type: 'STRING' },
              amount: { type: 'INTEGER' },
              transferToAccountId: { type: 'STRING' },
            },
            required: ['date', 'description', 'accountId', 'type', 'category', 'amount', 'transferToAccountId'],
          },
        };

        // Deteksi model yang benar-benar aktif & didukung di akun Google AI Studio pengguna
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
          }
        } catch (e) {
          console.error('List models failed:', e);
        }

        const preferredList = [
          process.env.GEMINI_MODEL?.trim(),
          'gemini-2.5-flash',
          'gemini-3.5-flash',
          'gemini-3.1-flash-lite',
          'gemini-3.8-flash',
          'gemini-flash-latest',
        ].filter(Boolean) as string[];

        // Urutkan model: model yang terbukti ada di akun -> model flash aktif lainnya -> daftar cadangan
        const candidateModels = Array.from(
          new Set([
            ...preferredList.filter(m => activeModels.length === 0 || activeModels.includes(m)),
            ...activeModels.filter(m => m.includes('flash')),
            ...activeModels,
            ...preferredList,
          ])
        ).filter(m => m && !m.includes('1.5') && !m.includes('2.0')); // Hindari model 1.5 dan 2.0 yang sudah ditutup Google

        let raw = '';
        let lastErrorMsg = '';

        // Metode 1: Menggunakan Google GenAI SDK (Mendukung auth key AQ. dan AIza secara bawaan)
        try {
          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          for (const modelToTry of candidateModels) {
            try {
              const aiParts: any[] = [];
              if (imageBase64) {
                aiParts.push({
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                });
              }
              const promptText =
                buildAiPrompt(accRows, categoryNames, today, Boolean(imageBase64)) +
                (text.trim() ? `\n\nTEKS INPUT:\n${text}` : '');
              aiParts.push({ text: promptText });

              const aiRes = await ai.models.generateContent({
                model: modelToTry,
                contents: { parts: aiParts },
                config: {
                  temperature: 0.1,
                  responseMimeType: 'application/json',
                },
              });

              const textVal =
                aiRes?.text ||
                (aiRes?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');

              if (textVal) {
                raw = textVal;
                break;
              }
            } catch (sdkErr: any) {
              console.error(`Gemini SDK error on model ${modelToTry}:`, sdkErr);
              lastErrorMsg = sdkErr.message || String(sdkErr);
              continue;
            }
          }
        } catch (sdkInitErr) {
          console.error('SDK init error:', sdkInitErr);
        }

        // Metode 2: Fallback ke REST API (otentikasi murni via x-goog-api-key & query param ?key=)
        if (!raw) {
          for (const modelToTry of candidateModels) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 45000);
            try {
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
              };

              const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToTry}:generateContent?key=${encodeURIComponent(apiKey)}`;
              const gRes = await fetch(restUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  contents: [{ role: 'user', parts }],
                  generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema },
                }),
                signal: controller.signal,
              });

              clearTimeout(timer);

              if (gRes.ok) {
                const gJson: any = await gRes.json();
                raw = (gJson?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
                if (raw) break;
              } else {
                const errText = await gRes.text();
                console.error(`Gemini REST error on model ${modelToTry}:`, gRes.status, errText);
                lastErrorMsg = `Gemini (${gRes.status}): ${errText.slice(0, 160)}`;
              }
            } catch (fetchErr: any) {
              clearTimeout(timer);
              lastErrorMsg = 'Koneksi ke server AI timeout. Coba lagi.';
              continue;
            }
          }
        }

        if (!raw) {
          return res.status(502).json({
            success: false,
            error:
              lastErrorMsg ||
              'Gagal memproses struk dengan Gemini. Pastikan Anda sudah melakukan Redeploy di Vercel setelah memasukkan API Key.',
          });
        }

        let items: any;
        try {
          items = JSON.parse(raw);
        } catch {
          return res.status(502).json({ success: false, error: 'Jawaban AI tidak bisa dibaca. Coba lagi.' });
        }

        // Validasi ulang hasil AI sebelum dikirim ke aplikasi
        const accountIdSet = new Set<string>(accountIds);
        const catMap = new Map<string, string>(
          categoryNames.map((c: string) => [c.toLowerCase(), c] as [string, string])
        );

        const transactions = (Array.isArray(items) ? items : [])
          .slice(0, 50)
          .map((it: any) => {
            const accountId = accountIdSet.has(it?.accountId) ? it.accountId : accountIds[0];
            const toId =
              accountIdSet.has(it?.transferToAccountId) && it.transferToAccountId !== accountId
                ? it.transferToAccountId
                : '';
            const rawCat = String(it?.category || '').trim();
            const matchedCat = catMap.get(rawCat.toLowerCase());
            const finalCat = toId
              ? 'Pindah Saldo'
              : (matchedCat || (rawCat.length > 0 && rawCat.length <= 50 ? rawCat : ''));

            return {
              date: /^\d{4}-\d{2}-\d{2}$/.test(String(it?.date || '')) ? it.date : today,
              description: String(it?.description || '').trim().slice(0, 255) || 'Transaksi',
              accountId,
              type: toId ? 'keluar' : it?.type === 'masuk' ? 'masuk' : 'keluar',
              category: finalCat,
              amount: Math.round(Number(it?.amount) || 0),
              transferToAccountId: toId,
            };
          })
          .filter((t: any) => t.amount > 0);

        return res.status(200).json({ success: true, transactions });
      }

      // Login / ganti PIN admin
      if (body.entity === 'auth') {
        // Panjang PIN (untuk login otomatis di layar PIN). null = tidak diketahui
        if (body.action === 'pin_info') {
          const pinRows = await sql`SELECT value FROM settings WHERE key = 'admin_pin' LIMIT 1`;
          if (pinRows.length === 0) {
            return res.status(200).json({ success: true, length: DEFAULT_PIN.length });
          }
          const lenRows = await sql`SELECT value FROM settings WHERE key = 'admin_pin_len' LIMIT 1`;
          const len = lenRows.length > 0 ? Number(lenRows[0].value) : 0;
          return res.status(200).json({ success: true, length: len > 0 ? len : null });
        }

        if (body.action === 'login') {
          const lockMinutes = await getLoginLock(sql);
          if (lockMinutes > 0) {
            return res.status(429).json({
              success: false,
              error: `Terlalu banyak percobaan. Coba lagi ${lockMinutes} menit lagi.`,
            });
          }
          if (!(await verifyPin(sql, String(body.pin || '')))) {
            await registerLoginFail(sql);
            return res.status(403).json({ success: false, error: 'PIN salah! Silakan periksa kembali PIN Anda.' });
          }
          await clearLoginFail(sql);
          return res.status(200).json({ success: true, token: signToken() });
        }

        if (body.action === 'change_pin') {
          if (!isAdminReq) return denyAdmin();
          const { currentPin, newPin } = body;
          if (!(await verifyPin(sql, String(currentPin || '')))) {
            return res.status(403).json({ success: false, error: 'PIN saat ini tidak cocok.' });
          }
          if (!/^\d{4,8}$/.test(String(newPin || ''))) {
            return res.status(400).json({ success: false, error: 'PIN baru harus 4-8 digit angka.' });
          }
          await savePin(sql, String(newPin));
          return res.status(200).json({ success: true });
        }

        return res.status(400).json({ success: false, error: 'Aksi tidak dikenal.' });
      }

      // Upsert 1 pengaturan (hanya admin, hanya key yang diizinkan)
      if (body.entity === 'setting' && body.key) {
        if (!isAdminReq) return denyAdmin();
        if (!PUBLIC_SETTINGS.includes(body.key)) {
          return res.status(400).json({ success: false, error: 'Pengaturan tidak diizinkan.' });
        }
        const { key, value } = body;
        await sql`
          INSERT INTO settings (key, value, updated_at)
          VALUES (${key}, ${String(value ?? '')}, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = CURRENT_TIMESTAMP;
        `;
        return res.status(200).json({ success: true, key });
      }

      // Tambah 1 kategori
      if (body.entity === 'category' && body.name) {
        const catName = String(body.name).trim().slice(0, 50);
        if (!catName) {
          return res.status(400).json({ success: false, error: 'Nama kategori kosong.' });
        }
        await sql`
          INSERT INTO categories (name) VALUES (${catName})
          ON CONFLICT (name) DO NOTHING;
        `;
        return res.status(200).json({ success: true, name: catName });
      }

      // Upsert 1 akun (hanya admin)
      if (body.entity === 'account' && body.account) {
        if (!isAdminReq) return denyAdmin();
        const acc = body.account;
        if (!acc.id || !acc.name || !acc.type) {
          return res.status(400).json({ success: false, error: 'Missing required fields: id, name, type.' });
        }
        await sql`
          INSERT INTO accounts (id, name, type, color, icon_name, initial_balance)
          VALUES (${acc.id}, ${acc.name}, ${acc.type}, ${acc.color || '#0284c7'}, ${acc.iconName || 'Wallet'}, ${Number(acc.initialBalance) || 0})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            color = EXCLUDED.color,
            icon_name = EXCLUDED.icon_name,
            initial_balance = EXCLUDED.initial_balance;
        `;
        return res.status(200).json({ success: true, id: acc.id });
      }

      // Batch transaksi (dan akun)
      if (body.batch && Array.isArray(body.transactions)) {
        const { transactions: batchTx, accounts: batchAcc } = body;

        if (Array.isArray(batchAcc) && !isAdminReq) return denyAdmin();
        if (!isAdminReq) {
          // Kasir hanya boleh menambah transaksi baru, bukan menimpa yang lama
          for (const t of batchTx) {
            const exists = await sql`SELECT 1 FROM transactions WHERE id = ${t.id} LIMIT 1`;
            if (exists.length > 0) return denyAdmin();
          }
        }

        if (Array.isArray(batchAcc)) {
          for (const acc of batchAcc) {
            await sql`
              INSERT INTO accounts (id, name, type, color, icon_name, initial_balance)
              VALUES (${acc.id}, ${acc.name}, ${acc.type}, ${acc.color || '#0284c7'}, ${acc.iconName || 'Wallet'}, ${acc.initialBalance || 0})
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                type = EXCLUDED.type,
                color = EXCLUDED.color,
                icon_name = EXCLUDED.icon_name,
                initial_balance = EXCLUDED.initial_balance;
            `;
          }
        }

        for (const tx of batchTx) {
          const cat = String(tx.category || '').trim();
          if (cat && cat !== 'Pindah Saldo' && cat.length <= 50) {
            await sql`INSERT INTO categories (name) VALUES (${cat}) ON CONFLICT (name) DO NOTHING;`;
          }

          await sql`
            INSERT INTO transactions (
              id, no, date, description, account_id, type, category, amount, notes, transfer_target_account_id, linked_transaction_id, created_at
            ) VALUES (
              ${tx.id},
              ${tx.no ?? null},
              ${tx.date},
              ${tx.description},
              ${tx.accountId || 'cash'},
              ${tx.type},
              ${tx.category || 'Toko'},
              ${Number(tx.amount) || 0},
              ${tx.notes ?? null},
              ${tx.transferTargetAccountId ?? null},
              ${tx.linkedTransactionId ?? null},
              ${tx.createdAt ? new Date(tx.createdAt).toISOString() : new Date().toISOString()}
            )
            ON CONFLICT (id) DO UPDATE SET
              no = EXCLUDED.no,
              date = EXCLUDED.date,
              description = EXCLUDED.description,
              account_id = EXCLUDED.account_id,
              type = EXCLUDED.type,
              category = EXCLUDED.category,
              amount = EXCLUDED.amount,
              notes = EXCLUDED.notes,
              transfer_target_account_id = EXCLUDED.transfer_target_account_id,
              linked_transaction_id = EXCLUDED.linked_transaction_id;
          `;
        }

        return res.status(200).json({ success: true, count: batchTx.length });
      }

      // Single transaction upsert
      const { id, no, date, description, accountId, type, category, amount, notes, transferTargetAccountId, linkedTransactionId, createdAt } = body;

      if (!description || amount === undefined || !date || !type) {
        return res.status(400).json({ success: false, error: 'Missing required fields: description, amount, date, type.' });
      }

      const txId = id || `tx-${Date.now()}`;

      if (!isAdminReq) {
        // Kasir hanya boleh menambah transaksi baru
        const exists = await sql`SELECT 1 FROM transactions WHERE id = ${txId} LIMIT 1`;
        if (exists.length > 0) return denyAdmin();
      }

      const singleCat = String(category || '').trim();
      if (singleCat && singleCat !== 'Pindah Saldo' && singleCat.length <= 50) {
        await sql`INSERT INTO categories (name) VALUES (${singleCat}) ON CONFLICT (name) DO NOTHING;`;
      }

      await sql`
        INSERT INTO transactions (
          id, no, date, description, account_id, type, category, amount, notes, transfer_target_account_id, linked_transaction_id, created_at
        ) VALUES (
          ${txId},
          ${no ?? null},
          ${date},
          ${description},
          ${accountId || 'cash'},
          ${type},
          ${category || 'Toko'},
          ${Number(amount) || 0},
          ${notes ?? null},
          ${transferTargetAccountId ?? null},
          ${linkedTransactionId ?? null},
          ${createdAt ? new Date(createdAt).toISOString() : new Date().toISOString()}
        )
        ON CONFLICT (id) DO UPDATE SET
          no = EXCLUDED.no,
          date = EXCLUDED.date,
          description = EXCLUDED.description,
          account_id = EXCLUDED.account_id,
          type = EXCLUDED.type,
          category = EXCLUDED.category,
          amount = EXCLUDED.amount,
          notes = EXCLUDED.notes,
          transfer_target_account_id = EXCLUDED.transfer_target_account_id,
          linked_transaction_id = EXCLUDED.linked_transaction_id;
      `;

      return res.status(200).json({ success: true, id: txId });
    }

    // 3. DELETE: semua hapus hanya untuk admin
    if (req.method === 'DELETE') {
      if (!isAdminReq) return denyAdmin();
      const { id, clearAll, entity } = req.query;

      if (entity === 'category') {
        const catName = req.query.name;
        if (!catName) {
          return res.status(400).json({ success: false, error: 'Missing category name.' });
        }
        await sql`UPDATE transactions SET category = '' WHERE category = ${catName};`;
        await sql`DELETE FROM categories WHERE name = ${catName};`;
        return res.status(200).json({ success: true, deletedName: catName });
      }

      if (entity === 'account') {
        if (!id) {
          return res.status(400).json({ success: false, error: 'Missing account id.' });
        }
        await sql`DELETE FROM accounts WHERE id = ${id};`;
        return res.status(200).json({ success: true, deletedId: id });
      }

      if (clearAll === 'true') {
        await sql`DELETE FROM transactions;`;
        return res.status(200).json({ success: true, message: 'All transactions deleted' });
      }

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing transaction id.' });
      }

      await sql`DELETE FROM transactions WHERE id = ${id};`;
      return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Vercel API error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
}