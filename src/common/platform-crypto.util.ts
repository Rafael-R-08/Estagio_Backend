import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encripta um valor de texto usando AES-256-GCM.
 * Retorna uma string no formato `iv:authTag:ciphertext` (tudo em hex).
 * @param plaintext Texto a encriptar
 * @param keyHex Chave de 64 caracteres hex (32 bytes)
 */
export function encryptApiKey(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('PLATFORM_ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes)');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Desencripta um valor previamente encriptado com `encryptApiKey`.
 * @param ciphertext String no formato `iv:authTag:ciphertext` (hex)
 * @param keyHex Chave de 64 caracteres hex (32 bytes)
 */
export function decryptApiKey(ciphertext: string, keyHex: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de apiKey encriptada inválido');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedData = Buffer.from(encryptedHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encryptedData) + decipher.final('utf8');
}

/**
 * Verifica se um valor já está no formato encriptado (iv:authTag:ciphertext).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => /^[0-9a-f]+$/i.test(p));
}
