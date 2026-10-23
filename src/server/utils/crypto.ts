import crypto from 'crypto';

const PREFIX = 'v1:';

function getEncryptionKeyBuffer(): Buffer | null {
  const rawKey = process.env.FRAME_ENCRYPTION_KEY;
  if (!rawKey || !rawKey.trim()) return null;
  const trimmed = rawKey.trim();
  // Accept 64-char hex, 32-byte base64, or derive 32 bytes via SHA-256
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  return crypto.createHash('sha256').update(trimmed).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  if (plain.startsWith(PREFIX)) return plain; // Already encrypted
  const key = getEncryptionKeyBuffer();
  if (!key) return plain;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith(PREFIX)) return stored;
  const key = getEncryptionKeyBuffer();
  if (!key) return stored;

  try {
    const parts = stored.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return stored;
    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return stored;
  }
}
