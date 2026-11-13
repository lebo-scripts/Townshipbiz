import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import type {
  BusinessProfile,
  ComplianceAssessmentItem,
  FinancialTransaction,
  VaultDocument,
} from './shared/types.ts';
import { requireAuth, type AuthenticatedRequest } from './server/middleware/auth.ts';
import { buildTransactionsCSV, computeFinancialAnalytics } from './server/services/analyticsEngine.ts';
import { assessBusinessCompliance, SA_COMPLIANCE_RULES } from './server/services/complianceEngine.ts';
import {
  askBusinessAdviserAI,
  extractReceiptWithAI,
  interpretDocumentWithAI,
} from './server/services/gemini.ts';
import {
  createResetToken,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
  verifyResetToken,
} from './server/services/passwordSecurity.ts';
import {
  computeSha256,
  deletePrivateFile,
  readPrivateFile,
  sanitizeIdSegment,
  savePrivateFile,
} from './server/services/privateVault.ts';

dotenv.config();

interface VaultIndexEntry {
  ownerUid: string;
  businessId: string;
  docId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

const STORAGE_DIR = path.resolve(process.cwd(), process.env.VAULT_STORAGE_DIR || '.private_storage');
const INDEX_FILE = path.join(STORAGE_DIR, '.vault_index.json');

async function readVaultIndex(): Promise<Record<string, VaultIndexEntry>> {
  try {
    const raw = await fs.readFile(INDEX_FILE, 'utf8');
    return JSON.parse(raw) as Record<string, VaultIndexEntry>;
  } catch {
    return {};
  }
}

async function writeVaultIndex(index: Record<string, VaultIndexEntry>): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2), { mode: 0o600 });
}

export function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite dev & Firebase popup auth compatibility
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(express.json({ limit: '10mb' }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down and try again.' },
  });
  app.use('/api', apiLimiter);

  const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 20 * 1024 * 1024);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: 5,
    },
  });

  const handleSingleUpload: express.RequestHandler = (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? `File exceeds maximum allowed size of ${Math.round(maxUploadBytes / (1024 * 1024))}MB.`
            : `Upload error: ${err.message}`;
        res.status(400).json({ error: message });
        return;
      }
      const message = err instanceof Error ? err.message : 'File upload failed.';
      res.status(400).json({ error: message });
    });
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'townshipbiz-api',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      timestamp: new Date().toISOString(),
    });
  });

  // Public compliance knowledge base reference (structured, verified rules)
  app.get('/api/compliance/rules', (_req, res) => {
    res.json({ rules: SA_COMPLIANCE_RULES });
  });

  // Authenticated Compliance Assessment Engine
  app.post('/api/compliance/assess', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const { business, savedProgress } = req.body as {
        business?: BusinessProfile;
        savedProgress?: Record<string, { status: 'pending' | 'in_progress' | 'completed' | 'not_applicable'; linkedDocumentId?: string; renewalDate?: string; notes?: string }>;
      };

      if (!business || !business.structure || !business.industry) {
        res.status(400).json({ error: 'Valid business profile is required for compliance assessment.' });
        return;
      }
      if (business.ownerUid && business.ownerUid !== req.user!.uid) {
        res.status(403).json({ error: 'Access denied: business belongs to another account.' });
        return;
      }

      const items = assessBusinessCompliance(business, savedProgress || {});
      res.json({ items });
    } catch (err) {
      console.error('Compliance assessment error:', err);
      res.status(500).json({ error: 'Failed to assess compliance requirements.' });
    }
  });

  // Authenticated Financial Analytics & Pattern Detection
  app.post('/api/analytics/summary', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const { transactions, startDate, endDate } = req.body as {
        transactions?: FinancialTransaction[];
        startDate?: string;
        endDate?: string;
      };
      if (!Array.isArray(transactions)) {
        res.status(400).json({ error: 'transactions array is required.' });
        return;
      }
      const unauthorized = transactions.some((t) => t.ownerUid && t.ownerUid !== req.user!.uid);
      if (unauthorized) {
        res.status(403).json({ error: 'Access denied: cross-business transaction data rejected.' });
        return;
      }

      const summary = computeFinancialAnalytics(transactions, { startDate, endDate });
      res.json(summary);
    } catch (err) {
      console.error('Analytics error:', err);
      res.status(500).json({ error: 'Failed to calculate financial summary.' });
    }
  });

  // CSV Export (formula-injection safe)
  app.post('/api/analytics/export-csv', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const { transactions } = req.body as { transactions?: FinancialTransaction[] };
      if (!Array.isArray(transactions)) {
        res.status(400).json({ error: 'transactions array is required.' });
        return;
      }
      const unauthorized = transactions.some((t) => t.ownerUid && t.ownerUid !== req.user!.uid);
      if (unauthorized) {
        res.status(403).json({ error: 'Access denied.' });
        return;
      }
      const csv = buildTransactionsCSV(transactions);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="townshipbiz-transactions.csv"');
      res.send(csv);
    } catch (err) {
      console.error('CSV export error:', err);
      res.status(500).json({ error: 'Failed to export CSV.' });
    }
  });

  // Receipt Scan + Private Vault Storage + Duplicate Detection
  app.post('/api/receipts/scan', requireAuth, handleSingleUpload, async (req: AuthenticatedRequest, res) => {
    try {
      const file = req.file;
      const businessId = String(req.body.businessId || '');
      if (!file) {
        res.status(400).json({ error: 'Receipt image or PDF file is required.' });
        return;
      }
      sanitizeIdSegment(businessId);

      let existingTransactions: FinancialTransaction[] = [];
      if (req.body.existingTransactions) {
        try {
          const parsed = JSON.parse(String(req.body.existingTransactions));
          if (Array.isArray(parsed)) existingTransactions = parsed;
        } catch {
          existingTransactions = [];
        }
      }

      const sha256 = computeSha256(file.buffer);
      const saved = await savePrivateFile(businessId, file.buffer, file.originalname, file.mimetype);
      const docId = `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      const index = await readVaultIndex();
      index[`${businessId}:${docId}`] = {
        ownerUid: req.user!.uid,
        businessId,
        docId,
        storageKey: saved.storageKey,
        originalName: file.originalname,
        mimeType: saved.detectedMime,
        sizeBytes: saved.sizeBytes,
        sha256: saved.sha256,
        createdAt: new Date().toISOString(),
      };
      await writeVaultIndex(index);

      const extraction = await extractReceiptWithAI(
        file.buffer,
        saved.detectedMime,
        existingTransactions,
        sha256
      );

      res.json({
        documentRecord: {
          id: docId,
          storageKey: saved.storageKey,
          sha256: saved.sha256,
          sizeBytes: saved.sizeBytes,
          mimeType: saved.detectedMime,
          name: file.originalname,
        },
        extraction,
      });
    } catch (err) {
      console.error('Receipt scan error:', err);
      const msg = err instanceof Error ? err.message : 'Receipt scanning failed.';
      res.status(400).json({ error: msg });
    }
  });

  // Document Vault Secure Upload + AI Interpretation
  app.post('/api/documents/upload', requireAuth, handleSingleUpload, async (req: AuthenticatedRequest, res) => {
    try {
      const file = req.file;
      const businessId = String(req.body.businessId || '');
      const requestedCategory = req.body.category ? String(req.body.category) : undefined;
      if (!file) {
        res.status(400).json({ error: 'Document file is required.' });
        return;
      }
      sanitizeIdSegment(businessId);

      const saved = await savePrivateFile(businessId, file.buffer, file.originalname, file.mimetype);
      const docId = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      const index = await readVaultIndex();
      index[`${businessId}:${docId}`] = {
        ownerUid: req.user!.uid,
        businessId,
        docId,
        storageKey: saved.storageKey,
        originalName: file.originalname,
        mimeType: saved.detectedMime,
        sizeBytes: saved.sizeBytes,
        sha256: saved.sha256,
        createdAt: new Date().toISOString(),
      };
      await writeVaultIndex(index);

      const interpretation = await interpretDocumentWithAI(
        file.buffer,
        saved.detectedMime,
        file.originalname,
        requestedCategory
      );

      res.json({
        documentRecord: {
          id: docId,
          storageKey: saved.storageKey,
          sha256: saved.sha256,
          sizeBytes: saved.sizeBytes,
          mimeType: saved.detectedMime,
          name: file.originalname,
        },
        interpretation,
      });
    } catch (err) {
      console.error('Document upload error:', err);
      const msg = err instanceof Error ? err.message : 'Document upload failed.';
      res.status(400).json({ error: msg });
    }
  });

  // Authenticated Private Document Download (Strict Business & Owner Isolation)
  app.get('/api/documents/:businessId/:docId/download', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const businessId = sanitizeIdSegment(String(req.params.businessId));
      const docId = sanitizeIdSegment(String(req.params.docId));
      const index = await readVaultIndex();
      const entry = index[`${businessId}:${docId}`];

      if (!entry) {
        res.status(404).json({ error: 'Document not found in private vault.' });
        return;
      }
      if (entry.ownerUid !== req.user!.uid || entry.businessId !== businessId) {
        res.status(403).json({ error: 'Access denied: you do not have permission to view this document.' });
        return;
      }

      const data = await readPrivateFile(businessId, entry.storageKey);
      const safeDownloadName = entry.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Type', entry.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"`);
      res.send(data);
    } catch (err) {
      console.error('Document download error:', err);
      res.status(400).json({ error: 'Unable to retrieve document.' });
    }
  });

  // Authenticated Private Document Deletion
  app.delete('/api/documents/:businessId/:docId', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const businessId = sanitizeIdSegment(String(req.params.businessId));
      const docId = sanitizeIdSegment(String(req.params.docId));
      const index = await readVaultIndex();
      const key = `${businessId}:${docId}`;
      const entry = index[key];

      if (entry) {
        if (entry.ownerUid !== req.user!.uid) {
          res.status(403).json({ error: 'Access denied: cannot delete another business document.' });
          return;
        }
        await deletePrivateFile(businessId, entry.storageKey);
        delete index[key];
        await writeVaultIndex(index);
      }

      res.json({ deleted: true });
    } catch (err) {
      console.error('Document delete error:', err);
      res.status(400).json({ error: 'Unable to delete document.' });
    }
  });

  // AI Business Adviser (RAG Retrieval + Strict Business Isolation)
  app.post('/api/adviser/ask', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { question, business, transactions, documents, compliance } = req.body as {
        question?: string;
        business?: BusinessProfile;
        transactions?: FinancialTransaction[];
        documents?: VaultDocument[];
        compliance?: ComplianceAssessmentItem[];
      };

      if (!question || typeof question !== 'string' || question.trim().length < 2) {
        res.status(400).json({ error: 'Please enter a clear question for the AI Business Adviser.' });
        return;
      }
      if (!business || (business.ownerUid && business.ownerUid !== req.user!.uid)) {
        res.status(403).json({ error: 'Access denied: business ownership verification failed.' });
        return;
      }

      const safeTx = Array.isArray(transactions)
        ? transactions.filter((t) => !t.ownerUid || t.ownerUid === req.user!.uid)
        : [];
      const safeDocs = Array.isArray(documents)
        ? documents.filter((d) => !d.ownerUid || d.ownerUid === req.user!.uid)
        : [];
      const safeCompliance = Array.isArray(compliance) && compliance.length > 0
        ? compliance
        : assessBusinessCompliance(business);

      const summary = computeFinancialAnalytics(safeTx);
      const reply = await askBusinessAdviserAI(question.trim().slice(0, 600), {
        business,
        transactions: safeTx,
        documents: safeDocs,
        compliance: safeCompliance,
        summary,
      });

      res.json(reply);
    } catch (err) {
      console.error('Adviser error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to answer business question.';
      res.status(500).json({ error: msg });
    }
  });

  // Password policy validation helper endpoint (non-privileged utility)
  app.post('/api/security/validate-password', (req, res) => {
    const { password } = req.body as { password?: string };
    const result = validatePasswordStrength(password || '');
    res.json(result);
  });

  // Expose security helpers on app.locals for unit verification if needed
  app.locals.security = { hashPassword, verifyPassword, createResetToken, verifyResetToken };

  // Guarantee /api/* never falls through to Vite HTML SPA fallback or Express HTML error pages
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled /api error:', err);
    if (res.headersSent) return;
    const status =
      typeof err === 'object' &&
      err !== null &&
      'status' in err &&
      typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 500;
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    res.status(status).json({ error: message });
  });

  return app;
}

async function startServer() {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`TownshipBiz server listening on http://0.0.0.0:${port}`);
  });
}

// Start server only when executed directly (allows Supertest/Vitest imports without binding port)
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  startServer().catch((err) => {
    console.error('Failed to start TownshipBiz server:', err);
    process.exit(1);
  });
}
