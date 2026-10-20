import { createDatabasePool } from './database.ts';
import { hashPassword } from './password.ts';
import { protectDocument } from './document-security.ts';
import { validateProvider } from './provider-validation.ts';
import type { Pool } from 'pg';
let pool: Pool | undefined;
export async function registerProvider(input: unknown) {
 const data=validateProvider(input);
 const document=protectDocument(data.documentType,data.document);
 const hash=await hashPassword(data.password);
 pool ??= createDatabasePool();
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const account=await client.query<{id:string}>('INSERT INTO maridao.accounts (email,password_hash) VALUES ($1,$2) RETURNING id',[data.email,hash]);
  const id=account.rows[0].id;
  await client.query(`INSERT INTO maridao.provider_profiles (account_id,full_name,phone,document_type,document_encrypted,document_fingerprint,categories,specialties,neighborhoods,availability) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,data.name,data.phone,data.documentType,document.encrypted,document.fingerprint,data.categories,data.specialties,data.neighborhoods,data.availability]);
  await client.query('COMMIT');
  return {id,name:data.name,city:'Palmas',state:'TO'};
 } catch(error) { try { await client.query('ROLLBACK'); } catch {} throw error; }
 finally {client.release();}
}
export async function closeProviderDatabase(){if(pool)await pool.end();}
