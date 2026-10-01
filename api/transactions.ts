import { neon } from '@neondatabase/serverless';
import { GoogleGenAI } from '@google/genai';

export const config = { maxDuration: 60 }; // Gemini bisa butuh >10 detik untuk foto

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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
    `Kamu adalah asisten pembukuan toko kecil di Indonesia. Ubah ${hasImage ? 'foto struk/nota dan/atau teks' : 'teks'} yang diberikan menjadi daftar transaksi keuangan.`,
    '',
    `Tanggal hari ini: ${today} (zona waktu WIB).`,
    '',
    'DAFTAR AKUN (accountId HARUS salah satu id ini):',
    accountList,
    '',
    'DAFTAR KATEGORI (tulis persis seperti di daftar; jika tidak ada yang cocok, isi string kosong ""):',
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
      ? '8. Untuk foto struk: buat SATU transaksi "keluar" dengan total akhir yang dibayar (setelah diskon/pajak). description berisi nama toko dan 1-3 barang utama. Jangan dipecah per barang, kecuali ada beberapa struk berbeda pada gambar.'
      : '',
    '9. Jika tidak ada transaksi yang bisa dibaca, kembalikan array kosong [].',
    '10. PENTING: Jika pengguna menulis instruksi seperti "kategori pokok semua", "buat kategori pokok semua", atau sejenisnya, MAKA SEMUA transaksi yang diekstrak HARUS menggunakan category yang diminta pengguna tersebut (misal "Pokok"). Jangan diubah ke kategori lain (seperti "Kendaraan" atau "Pribadi") meskipun ada kata seperti oli, infaq, atau nabung!',
  ].join('\n');
}

let isInitialized = false;

async function ensureTables(sql: any) {
  if (isInitialized) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        color VARCHAR(20) DEFAULT '#0284c7',
        icon_name VARCHAR(50) DEFAULT 'Wallet',
        initial_balance BIGINT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
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
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS categories (
        name VARCHAR(50) PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    isInitialized = true;
  } catch (e) {
    console.error('Error ensuring tables in Neon:', e);
  }
}

export default async function handler(req: any, res: any) {
  // Allow CORS for local dev / client calls
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

  if (!databaseUrl) {
    return res.status(500).json({
      error: 'DATABASE_URL environment variable is missing on Vercel.',
      hint: 'Add DATABASE_URL in Vercel project Settings -> Environment Variables.',
    });
  }

  const sql = neon(databaseUrl);
  await ensureTables(sql);

  try {
    // 1. GET: Fetch transactions and accounts
    if (req.method === 'GET') {
      // Ambil 1 pengaturan (mis. nama toko)
      if (req.query.entity === 'setting') {
        const rows = await sql`SELECT value FROM settings WHERE key = ${req.query.key} LIMIT 1`;
        return res.status(200).json({
          success: true,
          value: rows.length > 0 ? rows[0].value : null,
        });
      }
      const txRows = await sql`
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
      `;

      let accRows: any[] = [];
      try {
        accRows = await sql`
          SELECT id, name, type, color, icon_name as "iconName", initial_balance as "initialBalance"
          FROM accounts
          ORDER BY id ASC
        `;
      } catch (e) {
        throw e;
      }

      const catRows = await sql`SELECT name FROM categories ORDER BY created_at ASC, name ASC`;
      const nameRows = await sql`SELECT value FROM settings WHERE key = 'store_name' LIMIT 1`;

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

    // 2. POST / PUT: Insert or Update transaction
    if (req.method === 'POST' || req.method === 'PUT') {
      // AI Parse (teks bebas atau foto struk via Gemini)
      if (req.body.entity === 'ai_parse') {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return res.status(500).json({ error: 'GEMINI_API_KEY belum dikonfigurasi di server.' });
        }
        const { text, imageBase64, mimeType } = req.body;
        const accRows = await sql`SELECT id, name, type FROM accounts ORDER BY id ASC`;
        const catRows = await sql`SELECT name FROM categories ORDER BY name ASC`;
        const categories = catRows.map((c: any) => c.name);
        const today = new Date().toISOString().split('T')[0];
        const prompt = buildAiPrompt(accRows, categories, today, Boolean(imageBase64));

        const ai = new GoogleGenAI({ apiKey });
        const parts: any[] = [{ text: prompt }];
        if (text) parts.push({ text: `\nTEKS DARI PENGGUNA:\n${text}` });
        if (imageBase64) {
          const cleanB64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
          parts.push({
            inlineData: {
              data: cleanB64,
              mimeType: mimeType || 'image/jpeg',
            },
          });
        }

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ parts }],
          config: {
            responseMimeType: 'application/json',
          },
        });

        let transactions: any[] = [];
        try {
          const raw = response.text || '[]';
          transactions = JSON.parse(raw);
        } catch (e) {
          console.warn('Failed to parse AI response as JSON:', e);
        }

        return res.status(200).json({ success: true, transactions });
      }

      // Auth: login or change_pin
      if (req.body.entity === 'auth') {
        const { action, pin, currentPin, newPin } = req.body;
        const pinRows = await sql`SELECT value FROM settings WHERE key = 'admin_pin' LIMIT 1;`;
        const storedPin = pinRows.length > 0 ? pinRows[0].value : '1234';

        if (action === 'login') {
          if (pin === storedPin) {
            const expiry = Date.now() + 24 * 3600 * 1000;
            const token = `${expiry}.sig_${Math.random().toString(36).slice(2, 10)}`;
            return res.status(200).json({ success: true, token });
          } else {
            return res.status(401).json({ error: 'PIN Admin salah.' });
          }
        }

        if (action === 'change_pin') {
          if (currentPin !== storedPin) {
            return res.status(400).json({ error: 'PIN lama salah.' });
          }
          if (!newPin || newPin.length < 4) {
            return res.status(400).json({ error: 'PIN baru minimal 4 digit.' });
          }
          await sql`
            INSERT INTO settings (key, value, updated_at)
            VALUES ('admin_pin', ${newPin}, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET
              value = EXCLUDED.value,
              updated_at = CURRENT_TIMESTAMP;
          `;
          return res.status(200).json({ success: true });
        }
      }

      // Tambah 1 kategori
      if (req.body.entity === 'category' && req.body.name) {
        await sql`
          INSERT INTO categories (name) VALUES (${String(req.body.name).trim()})
          ON CONFLICT (name) DO NOTHING;
        `;
        return res.status(200).json({ success: true, name: req.body.name });
      }

      // Upsert 1 pengaturan
      if (req.body.entity === 'setting' && req.body.key) {
        const { key, value } = req.body;
        await sql`
          INSERT INTO settings (key, value, updated_at)
          VALUES (${key}, ${String(value ?? '')}, CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = CURRENT_TIMESTAMP;
        `;
        return res.status(200).json({ success: true, key });
      }

      // Upsert 1 akun
      if (req.body.entity === 'account' && req.body.account) {
        const acc = req.body.account;
        if (!acc.id || !acc.name || !acc.type) {
          return res.status(400).json({ error: 'Missing required fields: id, name, type.' });
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

      // Check if batch sync of all transactions
      if (req.body.batch && Array.isArray(req.body.transactions)) {
        const { transactions: batchTx, accounts: batchAcc } = req.body;
        
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
      const { id, no, date, description, accountId, type, category, amount, notes, transferTargetAccountId, linkedTransactionId, createdAt } = req.body;

      if (!description || amount === undefined || !date || !type) {
        return res.status(400).json({ error: 'Missing required fields: description, amount, date, type.' });
      }

      const txId = id || `tx-${Date.now()}`;

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

    // 3. DELETE: Delete single transaction or all
    if (req.method === 'DELETE') {
      const { id, clearAll, entity } = req.query;

      if (entity === 'category') {
        const catName = req.query.name;
        if (!catName) {
          return res.status(400).json({ error: 'Missing category name.' });
        }
        await sql`UPDATE transactions SET category = '' WHERE category = ${catName};`;
        await sql`DELETE FROM categories WHERE name = ${catName};`;
        return res.status(200).json({ success: true, deletedName: catName });
      }

      if (entity === 'account') {
        if (!id) {
          return res.status(400).json({ error: 'Missing account id.' });
        }
        await sql`DELETE FROM accounts WHERE id = ${id};`;
        return res.status(200).json({ success: true, deletedId: id });
      }

      if (clearAll === 'true') {
        await sql`DELETE FROM transactions;`;
        return res.status(200).json({ success: true, message: 'All transactions deleted' });
      }

      if (!id) {
        return res.status(400).json({ error: 'Missing transaction id.' });
      }

      await sql`DELETE FROM transactions WHERE id = ${id};`;
      return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Vercel API error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
