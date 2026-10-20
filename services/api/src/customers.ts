import { createDatabasePool } from './database.ts';
import { hashPassword } from './password.ts';
import { validateCustomer, type CustomerInput } from './customer-validation.ts';
import type { Pool } from 'pg';

let pool: Pool | undefined;
export async function registerCustomer(input: unknown) {
  const data = validateCustomer(input);
  const passwordHash = await hashPassword(data.password);
  pool ??= createDatabasePool();
  return saveCustomer(data, passwordHash, pool);
}

export async function saveCustomer(data: CustomerInput, passwordHash: string, database: Pick<Pool, 'connect'>) {
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(
      'INSERT INTO maridao.accounts (email, password_hash) VALUES ($1, $2) RETURNING id',
      [data.email, passwordHash],
    );
    const id = result.rows[0].id;
    await client.query(
      'INSERT INTO maridao.customer_profiles (account_id, full_name, phone, cpf, neighborhood) VALUES ($1, $2, $3, $4, $5)',
      [id, data.name, data.phone, data.cpf, data.neighborhood],
    );
    await client.query('COMMIT');
    return { id, name: data.name, city: 'Palmas', state: 'TO' };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure; never print query parameters. */ }
    throw error;
  } finally {
    client.release();
  }
}
export async function closeDatabase() { if (pool) await pool.end(); }
