import { createHash, randomBytes } from 'node:crypto';
import { createDatabasePool } from './database.ts';
import { verifyPassword } from './password.ts';
import type { Pool } from 'pg';

export type Role = 'customer' | 'provider' | 'admin';
export type ApprovalStatus = 'Em análise' | 'Aprovado' | 'Rejeitado';
// approvalStatus só existe para prestador; approvalReason só quando 'Rejeitado'. Administrador não tem endereço.
export type Profile = { id: string; name: string; email: string; neighborhood: string; city: string; state: string; role?: Role; mustChangePassword?: boolean; approvalStatus?: ApprovalStatus; approvalReason?: string };
export type Account = Profile & { password_hash: string };
export interface AuthStore {
  findAccount(email: string): Promise<Account | undefined>;
  createSession(hash: string, id: string, expiry: Date, expectedPasswordHash: string): Promise<void>;
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
  await store.createSession(tokenHash(token), account.id, expiresAt, account.password_hash);
  const { password_hash: _hash, ...user } = account;
  return { token, expiresAt: expiresAt.toISOString(), user };
}
let pool: Pool | undefined;
function db() { return pool ??= createDatabasePool(); }
export async function closeAuthDatabase() { if (pool) await pool.end(); }
// O papel é derivado do perfil existente; administrador tem precedência.
const profileSql = `a.id,a.email,COALESCE(ad.full_name,c.full_name,p.full_name) AS name,COALESCE(c.neighborhood,array_to_string(p.neighborhoods, ', '),'') AS neighborhood,COALESCE(c.city,p.city,'') AS city,COALESCE(c.state,p.state,'') AS state,
 CASE WHEN ad.account_id IS NOT NULL THEN 'admin' WHEN c.account_id IS NOT NULL THEN 'customer' ELSE 'provider' END AS role,a.must_change_password AS "mustChangePassword",
 CASE WHEN ad.account_id IS NULL AND c.account_id IS NULL THEN p.approval_status END AS "approvalStatus",
 CASE WHEN ad.account_id IS NULL AND c.account_id IS NULL AND p.approval_status='Rejeitado' THEN p.approval_reason END AS "approvalReason"
 FROM maridao.accounts a LEFT JOIN maridao.customer_profiles c ON c.account_id=a.id LEFT JOIN maridao.provider_profiles p ON p.account_id=a.id LEFT JOIN maridao.admin_profiles ad ON ad.account_id=a.id`;
const activeProfile = 'a.disabled_at IS NULL AND (c.account_id IS NOT NULL OR p.account_id IS NOT NULL OR ad.account_id IS NOT NULL)';
function withoutNulls<T extends object>(row: T | undefined) { return row && Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)) as T; }
export const databaseAuthStore: AuthStore = {
  async findAccount(email) {
    const result = await db().query<Account>(`SELECT a.password_hash,${profileSql} WHERE a.email=$1 AND ${activeProfile}`, [email]);
    return withoutNulls(result.rows[0]);
  },
  async createSession(hash, id, expiry, expectedPasswordHash) {
    const client=await db().connect();
    try {
      await client.query('BEGIN');
      const current=(await client.query('SELECT password_hash FROM maridao.accounts WHERE id=$1 AND disabled_at IS NULL FOR UPDATE',[id])).rows[0];
      if(!current||current.password_hash!==expectedPasswordHash)throw new AuthError('A conta mudou. Entre novamente.');
      await client.query('DELETE FROM maridao.sessions WHERE expires_at <= now()');
      await client.query('INSERT INTO maridao.sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)',[hash,id,expiry]);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  },
  async findSession(hash) {
    const result = await db().query<Profile>(`SELECT ${profileSql.replace('FROM maridao.accounts a','FROM maridao.sessions s JOIN maridao.accounts a ON a.id=s.account_id')} WHERE s.token_hash=$1 AND s.expires_at > now() AND ${activeProfile}`, [hash]);
    return withoutNulls(result.rows[0]);
  },
  async deleteSession(hash) { await db().query('DELETE FROM maridao.sessions WHERE token_hash=$1', [hash]); },
};
