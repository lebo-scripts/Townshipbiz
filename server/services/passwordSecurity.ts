import crypto from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (typeof password !== 'string' || password.length < 10) {
    return { valid: false, reason: 'Password must be at least 10 characters long.' };
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      valid: false,
      reason: 'Password must include uppercase, lowercase, and numeric characters.',
    };
  }
  return { valid: true };
}

export function hashPassword(password: string): string {
  const check = validatePasswordStrength(password);
  if (!check.valid) {
    throw new Error(check.reason || 'Weak password');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || !storedHash.startsWith('scrypt$')) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, originalHex] = parts;
  if (!salt || !originalHex) return false;

  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function createResetToken(email: string, secret: string, ttlSeconds = 900): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ email: email.toLowerCase(), exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyResetToken(
  token: string,
  secret: string
): { valid: boolean; email?: string; reason?: string } {
  if (!token || !token.includes('.')) {
    return { valid: false, reason: 'Malformed reset token' };
  }
  const [payload, sig] = token.split('.');
  if (!payload || !sig) {
    return { valid: false, reason: 'Invalid token format' };
  }
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'Invalid token signature' };
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
      exp?: number;
    };
    if (!decoded.email || typeof decoded.exp !== 'number') {
      return { valid: false, reason: 'Corrupted token payload' };
    }
    if (Math.floor(Date.now() / 1000) > decoded.exp) {
      return { valid: false, reason: 'Reset token has expired' };
    }
    return { valid: true, email: decoded.email };
  } catch {
    return { valid: false, reason: 'Invalid token payload' };
  }
}
