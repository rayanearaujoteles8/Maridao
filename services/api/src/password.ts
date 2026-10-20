import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$131072$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$131072$8$1') return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}

let deriving = 0;
export class PasswordCapacityError extends Error {}
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (deriving >= 2) throw new PasswordCapacityError('Servidor ocupado.');
  deriving += 1;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result));
    });
  } finally { deriving -= 1; }
}
