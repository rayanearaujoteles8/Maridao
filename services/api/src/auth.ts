import { createHash, randomBytes } from 'node:crypto';
import { createDatabasePool } from './database.ts';
import { verifyPassword } from './password.ts';
import type { Pool } from 'pg';

export type Profile = { id: string; name: string; email: string; neighborhood: string; city: string; state: string; role?: 'customer' | 'provider' };
export type Account = Profile & { password_hash: string };
export interface AuthStore {
  findAccount(email: string): Promise<Account | undefined>;
  createSession(hash: string, id: string, expiry: Date): Promise<void>;
  findSession(hash: string): Promise<Profile | undefined>;
  deleteSession(hash: string): Promise<void>;
}
export class AuthError extends Error {}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function bearerToken(header: string | undefined) {
  return header?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
}
export async function login(input: unknown, store: AuthStore = databaseAuthStore) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AuthError('Preencha e-mail e senha.');
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => key !== 'email' && key !== 'password')) throw new AuthError('Formulário inválido.');
  if (typeof data.email !== 'string' || typeof data.password !== 'string' || !data.email.trim() || !data.password.trim()) throw new AuthError('Preencha e-mail e senha.');
  if (data.email.length > 254 || [...data.password].length > 128) throw new AuthError('E-mail ou senha incorretos.');
  const account = await store.findAccount(data.email.trim().toLowerCase());
  // Equal-cost derivation for unknown emails avoids a fast account-existence branch.
  const dummy = 'scrypt$131072$8$1$' + Buffer.alloc(16, 1).toString('base64') + '$' + Buffer.alloc(64, 1).toString('base64');
  const matches = await verifyPassword(data.password, account?.password_hash ?? dummy);
  if (!account || !matches) throw new AuthError('E-mail ou senha incorretos.');
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  await store.createSession(tokenHash(token), account.id, expiresAt);
  const { password_hash: _hash, ...user } = account;
  return { token, expiresAt: expiresAt.toISOString(), user };
}
let pool: Pool | undefined;
function db() { return pool ??= createDatabasePool(); }
export async function closeAuthDatabase() { if (pool) await pool.end(); }
export const databaseAuthStore: AuthStore = {
  async findAccount(email) {
    const result = await db().query<Account>(`SELECT a.id,a.email,a.password_hash,COALESCE(c.full_name,p.full_name) AS name,COALESCE(c.neighborhood,array_to_string(p.neighborhoods, ', ')) AS neighborhood,COALESCE(c.city,p.city) AS city,COALESCE(c.state,p.state) AS state,CASE WHEN c.account_id IS NOT NULL THEN 'customer' ELSE 'provider' END AS role FROM maridao.accounts a LEFT JOIN maridao.customer_profiles c ON c.account_id=a.id LEFT JOIN maridao.provider_profiles p ON p.account_id=a.id WHERE a.email=$1 AND (c.account_id IS NOT NULL OR p.account_id IS NOT NULL)`, [email]);
    return result.rows[0];
  },
  async createSession(hash, id, expiry) {
    await db().query('DELETE FROM maridao.sessions WHERE expires_at <= now()');
    await db().query('INSERT INTO maridao.sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)', [hash, id, expiry]);
  },
  async findSession(hash) {
    const result = await db().query<Profile>(`SELECT a.id,a.email,COALESCE(c.full_name,p.full_name) AS name,COALESCE(c.neighborhood,array_to_string(p.neighborhoods, ', ')) AS neighborhood,COALESCE(c.city,p.city) AS city,COALESCE(c.state,p.state) AS state,CASE WHEN c.account_id IS NOT NULL THEN 'customer' ELSE 'provider' END AS role FROM maridao.sessions s JOIN maridao.accounts a ON a.id=s.account_id LEFT JOIN maridao.customer_profiles c ON c.account_id=a.id LEFT JOIN maridao.provider_profiles p ON p.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at > now() AND (c.account_id IS NOT NULL OR p.account_id IS NOT NULL)`, [hash]);
    return result.rows[0];
  },
  async deleteSession(hash) { await db().query('DELETE FROM maridao.sessions WHERE token_hash=$1', [hash]); },
};
