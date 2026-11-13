import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const STORAGE_ROOT = path.resolve(process.cwd(), process.env.VAULT_STORAGE_DIR || '.private_storage');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 20 * 1024 * 1024);

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'text/plain',
  'text/csv',
  'application/octet-stream',
]);

export function sanitizeIdSegment(segment: string): string {
  if (!segment || !/^[a-zA-Z0-9_-]{1,128}$/.test(segment)) {
    throw new Error('Invalid identifier format.');
  }
  return segment;
}

export function sniffBinaryMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return 'image/gif';
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'image/bmp';
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'mif1' || brand === 'msf1') {
      return 'image/heic';
    }
  }
  return null;
}

export function detectMagicMimeType(
  buffer: Buffer,
  declaredMime: string
): { valid: boolean; reason?: string; detectedMime?: string } {
  if (!buffer || buffer.length === 0) {
    return { valid: false, reason: 'File is empty.' };
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      reason: `File exceeds maximum size of ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`,
    };
  }

  const normalizedDeclared = (declaredMime || '').split(';')[0].trim().toLowerCase();

  // Reject executable signatures (MZ / PE, ELF, Mach-O, shebang scripts)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { valid: false, reason: 'Executable files are not permitted.' };
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return { valid: false, reason: 'Executable binary files are not permitted.' };
  }
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa && (buffer[3] === 0xce || buffer[3] === 0xcf)) ||
      (buffer[0] === 0xcf && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe))
  ) {
    return { valid: false, reason: 'Executable binary files are not permitted.' };
  }

  if (normalizedDeclared && !ALLOWED_MIME_TYPES.has(normalizedDeclared)) {
    return {
      valid: false,
      reason: `Unsupported file type: ${normalizedDeclared}. Allowed: JPG, PNG, WEBP, HEIC, GIF, PDF, CSV, TXT.`,
    };
  }

  const sniffed = sniffBinaryMimeType(buffer);
  if (sniffed) {
    if (normalizedDeclared === 'application/pdf' && sniffed !== 'application/pdf') {
      return { valid: false, reason: 'File content does not match PDF signature.' };
    }
    return { valid: true, detectedMime: sniffed };
  }

  if (normalizedDeclared === 'application/pdf') {
    return { valid: false, reason: 'File content does not match PDF signature.' };
  }

  if (normalizedDeclared === 'text/plain' || normalizedDeclared === 'text/csv') {
    if (buffer.includes(0x00)) {
      return { valid: false, reason: 'Binary content is not valid in text or CSV uploads.' };
    }
    return { valid: true, detectedMime: normalizedDeclared };
  }

  return {
    valid: false,
    reason: 'Unrecognised file signature. Please upload a valid JPG, PNG, WEBP, HEIC, or PDF file.',
  };
}

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function savePrivateFile(
  businessId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{ storageKey: string; sha256: string; sizeBytes: number; detectedMime: string }> {
  const safeBiz = sanitizeIdSegment(businessId);
  const validation = detectMagicMimeType(buffer, mimeType);
  if (!validation.valid || !validation.detectedMime) {
    throw new Error(validation.reason || 'Invalid upload file.');
  }

  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) || '.bin';
  const storageKey = `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${ext}`;
  const bizDir = path.join(STORAGE_ROOT, safeBiz);
  await fs.mkdir(bizDir, { recursive: true, mode: 0o700 });

  const targetPath = path.resolve(bizDir, storageKey);
  if (!targetPath.startsWith(bizDir + path.sep)) {
    throw new Error('Unsafe storage path detected.');
  }

  await fs.writeFile(targetPath, buffer, { mode: 0o600 });
  return {
    storageKey,
    sha256: computeSha256(buffer),
    sizeBytes: buffer.length,
    detectedMime: validation.detectedMime,
  };
}

export async function readPrivateFile(businessId: string, storageKey: string): Promise<Buffer> {
  const safeBiz = sanitizeIdSegment(businessId);
  if (!/^[a-zA-Z0-9_.-]{4,120}$/.test(storageKey) || storageKey.includes('..')) {
    throw new Error('Invalid storage key.');
  }
  const bizDir = path.join(STORAGE_ROOT, safeBiz);
  const targetPath = path.resolve(bizDir, storageKey);
  if (!targetPath.startsWith(bizDir + path.sep)) {
    throw new Error('Path traversal denied.');
  }
  return await fs.readFile(targetPath);
}

export async function deletePrivateFile(businessId: string, storageKey: string): Promise<void> {
  const safeBiz = sanitizeIdSegment(businessId);
  if (!/^[a-zA-Z0-9_.-]{4,120}$/.test(storageKey) || storageKey.includes('..')) {
    throw new Error('Invalid storage key.');
  }
  const bizDir = path.join(STORAGE_ROOT, safeBiz);
  const targetPath = path.resolve(bizDir, storageKey);
  if (!targetPath.startsWith(bizDir + path.sep)) {
    throw new Error('Path traversal denied.');
  }
  await fs.unlink(targetPath).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err;
  });
}
