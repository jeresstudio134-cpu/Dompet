import { neon } from '@neondatabase/serverless';

export default async function handler(req: any, res: any) {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

  if (!databaseUrl) {
    return res.status(500).json({
      error: 'DATABASE_URL environment variable is missing on Vercel.',
      hint: 'Add DATABASE_URL in Vercel project Settings -> Environment Variables.',
    });
  }

  const sql = neon(databaseUrl);

  try {
    if (req.method === 'GET') {
      const { monthYear, accountId } = req.query;

      let query = sql`
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

      const rows = await query;
      return res.status(200).json({ success: true, transactions: rows });
    }

    if (req.method === 'POST') {
      const { id, no, date, description, accountId, type, category, amount, notes, transferTargetAccountId } = req.body;

      if (!description || !amount || !date || !type) {
        return res.status(400).json({ error: 'Missing required fields: description, amount, date, type.' });
      }

      const txId = id || `tx-${Date.now()}`;

      await sql`
        INSERT INTO transactions (
          id, no, date, description, account_id, type, category, amount, notes, transfer_target_account_id
        ) VALUES (
          ${txId},
          ${no ?? null},
          ${date},
          ${description},
          ${accountId || 'cash'},
          ${type},
          ${category || 'Pribadi'},
          ${amount},
          ${notes ?? null},
          ${transferTargetAccountId ?? null}
        )
        ON CONFLICT (id) DO UPDATE SET
          description = EXCLUDED.description,
          amount = EXCLUDED.amount,
          type = EXCLUDED.type,
          category = EXCLUDED.category,
          date = EXCLUDED.date,
          account_id = EXCLUDED.account_id;
      `;

      return res.status(201).json({ success: true, id: txId });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Missing transaction id.' });
      }

      await sql`DELETE FROM transactions WHERE id = ${id};`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Vercel API error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
