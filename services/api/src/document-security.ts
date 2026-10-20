import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
function key(name: string) {
 const value = process.env[name];
 if (!value || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Chave de proteção de documentos não configurada.');
 return Buffer.from(value, 'hex');
}
export function protectDocument(type: string, value: string) {
 const plaintext = `${type}:${value}`;
 const encryptionKey = key('DOCUMENT_ENCRYPTION_KEY');
 const indexKey = key('DOCUMENT_INDEX_KEY');
 const iv = randomBytes(12);
 const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
 cipher.setAAD(Buffer.from('maridao-provider-document-v1'));
 const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
 return {
  encrypted: ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.'),
  fingerprint: createHmac('sha256', indexKey).update(plaintext).digest('hex'),
 };
}
