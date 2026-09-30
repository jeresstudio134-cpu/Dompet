import { neon } from '@neondatabase/serverless';

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
        console.warn('Accounts table fetch warning:', e);
      }

      return res.status(200).json({
        success: true,
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
      const { id, clearAll } = req.query;

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
