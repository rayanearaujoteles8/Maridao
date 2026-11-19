import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
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
export const documentFingerprint = (type: string, value: string) => createHmac('sha256', key('DOCUMENT_INDEX_KEY')).update(`${type}:${value}`).digest('hex');
// UC14.3: o documento completo só é lido para a análise do cadastro pelo administrador.
export function revealDocument(payload: string) {
 const [version, iv, tag, body] = payload.split('.');
 if (version !== 'v1' || !iv || !tag || !body) throw new Error('Documento protegido inválido.');
 const decipher = createDecipheriv('aes-256-gcm', key('DOCUMENT_ENCRYPTION_KEY'), Buffer.from(iv, 'base64'));
 decipher.setAAD(Buffer.from('maridao-provider-document-v1'));
 decipher.setAuthTag(Buffer.from(tag, 'base64'));
 const plaintext = Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
 const separator = plaintext.indexOf(':');
 return { type: plaintext.slice(0, separator), value: plaintext.slice(separator + 1) };
}
export const formatCpf = (digits: string) => /^\d{11}$/.test(digits) ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` : digits;
// Listas administrativas mostram só os seis dígitos centrais.
export const maskCpf = (digits: string | null | undefined) => typeof digits === 'string' && /^\d{11}$/.test(digits) ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**` : null;
