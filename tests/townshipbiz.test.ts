import { describe, expect, it } from 'vitest';
import type { BusinessProfile, FinancialTransaction, VaultDocument } from '../shared/types.ts';
import { canRetryGoogleSignInWithRedirect, isEmailVerifiedUser } from '../src/lib/auth.ts';
import { buildTransactionsCSV, computeFinancialAnalytics } from '../server/services/analyticsEngine.ts';
import { assessBusinessCompliance } from '../server/services/complianceEngine.ts';
import {
  findDuplicateReceiptCandidates,
  createGeminiClient,
  createReceiptExtractionConfig,
  createReceiptExtractionError,
  GEMINI_API_VERSION,
  getGeminiClientOptions,
  parseReceiptExtractionResponse,
  retrieveRelevantRecords,
  stripMarkdownAndParseJson,
} from '../server/services/gemini.ts';
import {
  createResetToken,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
  verifyResetToken,
} from '../server/services/passwordSecurity.ts';
import {
  computeSha256,
  detectMagicMimeType,
  sanitizeIdSegment,
} from '../server/services/privateVault.ts';

describe('Security & Authentication Utilities', () => {
  it('allows profile setup only after Firebase reports a verified email', () => {
    expect(isEmailVerifiedUser({ emailVerified: true })).toBe(true);
    expect(isEmailVerifiedUser({ emailVerified: false })).toBe(false);
    expect(isEmailVerifiedUser(null)).toBe(false);
  });

  it('offers Google redirect retry only for popup-specific failures', () => {
    expect(canRetryGoogleSignInWithRedirect('auth/popup-closed-by-user')).toBe(true);
    expect(canRetryGoogleSignInWithRedirect('auth/popup-blocked')).toBe(true);
    expect(canRetryGoogleSignInWithRedirect('auth/web-storage-unsupported')).toBe(true);
    expect(canRetryGoogleSignInWithRedirect('permission-denied')).toBe(false);
    expect(canRetryGoogleSignInWithRedirect(undefined)).toBe(false);
  });

  it('hashes and verifies strong passwords with unique salts', () => {
    const h1 = hashPassword('SowetoBiz#2026');
    const h2 = hashPassword('SowetoBiz#2026');
    expect(h1).not.toEqual(h2);
    expect(h1.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('SowetoBiz#2026', h1)).toBe(true);
    expect(verifyPassword('WrongPass#2026', h1)).toBe(false);
  });

  it('rejects weak passwords', () => {
    expect(validatePasswordStrength('short').valid).toBe(false);
    expect(validatePasswordStrength('alllowercase123').valid).toBe(false);
    expect(validatePasswordStrength('StrongPass123').valid).toBe(true);
  });

  it('creates and verifies signed reset tokens and rejects tampered or expired tokens', () => {
    const secret = 'test-secret-key-32-chars-minimum';
    const token = createResetToken('owner@spaza.co.za', secret, 600);
    expect(verifyResetToken(token, secret)).toEqual({
      valid: true,
      email: 'owner@spaza.co.za',
    });

    // Tampered token
    const tampered = token.slice(0, -2) + 'xx';
    expect(verifyResetToken(tampered, secret).valid).toBe(false);

    // Expired token
    const expired = createResetToken('owner@spaza.co.za', secret, -10);
    expect(verifyResetToken(expired, secret).valid).toBe(false);
  });
});

describe('Private Document Vault Security', () => {
  it('rejects path traversal and unsafe business/document IDs', () => {
    expect(() => sanitizeIdSegment('../etc/passwd')).toThrow();
    expect(() => sanitizeIdSegment('biz/123')).toThrow();
    expect(sanitizeIdSegment('biz_123-abc')).toBe('biz_123-abc');
  });

  it('validates magic bytes and blocks spoofed executables or oversized files', () => {
    const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj');
    expect(detectMagicMimeType(validPdf, 'application/pdf').valid).toBe(true);

    // Executable MZ header disguised as PDF
    const fakePdfExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(detectMagicMimeType(fakePdfExe, 'application/pdf').valid).toBe(false);

    // ELF binary disguised as PNG
    const elfBinary = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00]);
    expect(detectMagicMimeType(elfBinary, 'image/png').valid).toBe(false);

    // Unsupported MIME type
    expect(detectMagicMimeType(Buffer.from('alert(1)'), 'application/javascript').valid).toBe(false);

    // Mismatched / generic MIME type with real PNG bytes (e.g. screenshot saved as .jpg or mobile octet-stream)
    const realPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const sniffedPng = detectMagicMimeType(realPng, 'image/jpeg');
    expect(sniffedPng.valid).toBe(true);
    expect(sniffedPng.detectedMime).toBe('image/png');

    const sniffedOctet = detectMagicMimeType(realPng, 'application/octet-stream');
    expect(sniffedOctet.valid).toBe(true);
    expect(sniffedOctet.detectedMime).toBe('image/png');
  });

  it('parses markdown-fenced and prefixed Gemini JSON responses safely', () => {
    const fenced = '```json\n{"merchant":"Shoprite","total":124.5}\n```';
    expect(stripMarkdownAndParseJson<{ merchant: string; total: number }>(fenced)).toEqual({
      merchant: 'Shoprite',
      total: 124.5,
    });
    expect(stripMarkdownAndParseJson('Here is the JSON:\n{"total":50}')).toEqual({ total: 50 });
    expect(stripMarkdownAndParseJson('not valid json at all')).toBeNull();
  });

  it('configures Gemini structured output for v1beta and rejects incomplete receipt JSON', () => {
    expect(GEMINI_API_VERSION).toBe('v1beta');
    expect(getGeminiClientOptions('test-api-key').httpOptions?.apiVersion).toBe('v1beta');
    expect(createGeminiClient('test-api-key')).toBeDefined();
    const config = createReceiptExtractionConfig();
    expect(config.responseMimeType).toBe('application/json');
    expect(config.responseSchema).toMatchObject({ required: ['merchant', 'date', 'total'] });
    expect(config).not.toHaveProperty('thinkingConfig');
    expect(parseReceiptExtractionResponse('{"merchant":"Shoprite","date":null,"total":124.5}')).toEqual({
      merchant: 'Shoprite',
      date: null,
      total: 124.5,
    });
    expect(parseReceiptExtractionResponse('{"merchant":"Shoprite"}')).toBeNull();
    expect(parseReceiptExtractionResponse('not JSON')).toBeNull();
  });

  it('preserves useful Gemini errors when reporting receipt extraction failures', () => {
    expect(createReceiptExtractionError(new Error('Thinking level is not supported for this model.')).message).toBe(
      'Receipt extraction failed: Thinking level is not supported for this model.'
    );
    expect(createReceiptExtractionError('unknown failure').message).toBe(
      'Receipt extraction failed: Unexpected OCR error.'
    );
  });

  it('produces deterministic SHA-256 hashes for duplicate detection', () => {
    const a = computeSha256(Buffer.from('receipt-data-1'));
    const b = computeSha256(Buffer.from('receipt-data-1'));
    const c = computeSha256(Buffer.from('receipt-data-2'));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('Financial Analytics, Pattern Detection & CSV Safety', () => {
  const sampleTransactions: FinancialTransaction[] = [
    {
      id: 't1',
      ownerUid: 'u1',
      businessId: 'b1',
      type: 'income',
      status: 'paid',
      amount: 10000,
      currency: 'ZAR',
      category: 'Cash sales',
      description: 'Monthly sales',
      date: '2026-09-10',
    },
    {
      id: 't2',
      ownerUid: 'u1',
      businessId: 'b1',
      type: 'expense',
      status: 'paid',
      amount: 1000,
      currency: 'ZAR',
      category: 'Transport',
      merchantOrParty: 'Bakkie Express',
      description: 'Deliveries',
      date: '2026-09-12',
    },
    {
      id: 't3',
      ownerUid: 'u1',
      businessId: 'b1',
      type: 'income',
      status: 'paid',
      amount: 8000,
      currency: 'ZAR',
      category: 'Cash sales',
      description: 'Monthly sales',
      date: '2026-10-10',
    },
    {
      id: 't4',
      ownerUid: 'u1',
      businessId: 'b1',
      type: 'expense',
      status: 'paid',
      amount: 1500,
      currency: 'ZAR',
      category: 'Transport',
      merchantOrParty: 'Bakkie Express',
      description: 'Deliveries',
      date: '2026-10-12',
    },
    {
      id: 't5',
      ownerUid: 'u1',
      businessId: 'b1',
      type: 'receivable',
      status: 'overdue',
      amount: 2500,
      currency: 'ZAR',
      category: 'Wholesale orders',
      merchantOrParty: 'Local Creche',
      description: 'Unpaid food supply',
      date: '2026-10-01',
      dueDate: '2026-10-05',
    },
  ];

  it('computes totals, category breakdown, and pattern insights accurately', () => {
    const summary = computeFinancialAnalytics(sampleTransactions);
    expect(summary.totalIncome).toBe(18000);
    expect(summary.totalExpenses).toBe(2500);
    expect(summary.netCashMovement).toBe(15500);
    expect(summary.outstandingReceivables).toBe(2500);
    expect(summary.insights.some((i) => i.title.includes('Transport expenses rose'))).toBe(true);
    expect(summary.insights.some((i) => i.title.includes('unpaid customer payment'))).toBe(true);
  });

  it('neutralizes CSV formula injection payloads', () => {
    const maliciousTx: FinancialTransaction[] = [
      {
        id: 'tx_evil',
        ownerUid: 'u1',
        businessId: 'b1',
        type: 'expense',
        status: 'paid',
        amount: 50,
        currency: 'ZAR',
        category: 'Other expenses',
        description: '=CMD("calc")',
        merchantOrParty: '+SUM(A1:A2)',
        date: '2026-10-15',
      },
    ];
    const csv = buildTransactionsCSV(maliciousTx);
    expect(csv).toContain("\"'=CMD");
    expect(csv).toContain("\"'+SUM");
  });
});

describe('Duplicate Receipt Detection', () => {
  it('flags matching file hashes and matching date+amount+merchant', () => {
    const existing: FinancialTransaction[] = [
      {
        id: 'tx_existing',
        ownerUid: 'u1',
        businessId: 'b1',
        type: 'expense',
        status: 'paid',
        amount: 450.5,
        currency: 'ZAR',
        category: 'Inventory and stock',
        description: 'Stock',
        merchantOrParty: 'Makro Crown Mines',
        date: '2026-10-20',
        receiptHash: 'abc123hash',
      },
    ];

    const hashDup = findDuplicateReceiptCandidates(
      { merchant: 'Other', date: '2026-10-21', total: 100 },
      existing,
      'abc123hash'
    );
    expect(hashDup).toHaveLength(1);

    const detailDup = findDuplicateReceiptCandidates(
      { merchant: 'Makro', date: '2026-10-20', total: 450.5 },
      existing
    );
    expect(detailDup).toHaveLength(1);
  });
});

describe('South African Regulatory Compliance Engine', () => {
  it('correctly exempts informal solo food trader from CIPC, VAT, and UIF while requiring R638 COA', () => {
    const spaza: BusinessProfile = {
      id: 'b_spaza',
      ownerUid: 'u1',
      name: "Mama Zanele's Spaza",
      industry: 'Spaza & Grocery Retail',
      structure: 'informal',
      vatRegistered: false,
      location: 'Soweto',
      municipality: 'City of Johannesburg',
      province: 'Gauteng',
      employeeCount: 0,
      annualTurnoverRange: 'R50,000 - R300,000 / year',
    };

    const items = assessBusinessCompliance(spaza);
    const byId = Object.fromEntries(items.map((i) => [i.rule.id, i]));

    expect(byId['cipc-registration-annual-return'].classification).toBe('not_applicable');
    expect(byId['sars-vat'].classification).toBe('not_applicable');
    expect(byId['uif-contributions'].classification).toBe('not_applicable');
    expect(byId['r638-food-premises-coa'].classification).toBe('mandatory');
    expect(byId['popia-data-protection'].classification).toBe('mandatory');
  });

  it('enforces CIPC, VAT, UIF, and COIDA for registered (Pty) Ltd with staff above R1M', () => {
    const company: BusinessProfile = {
      id: 'b_pty',
      ownerUid: 'u1',
      name: 'Kasi Logistics (Pty) Ltd',
      industry: 'Transport & Delivery',
      structure: 'pty_ltd',
      vatRegistered: true,
      location: 'Pretoria',
      province: 'Gauteng',
      employeeCount: 6,
      annualTurnoverRange: 'Above R1,000,000 / year',
    };

    const items = assessBusinessCompliance(company);
    const byId = Object.fromEntries(items.map((i) => [i.rule.id, i]));

    expect(byId['cipc-registration-annual-return'].classification).toBe('mandatory');
    expect(byId['sars-vat'].classification).toBe('mandatory');
    expect(byId['uif-contributions'].classification).toBe('mandatory');
    expect(byId['coida-compensation'].classification).toBe('mandatory');
    expect(byId['r638-food-premises-coa'].classification).toBe('not_applicable');
  });
});

describe('AI Business Adviser RAG Retrieval', () => {
  it('retrieves only bounded relevant records and constructs citations', () => {
    const business: BusinessProfile = {
      id: 'b1',
      ownerUid: 'u1',
      name: 'Orlando Bakery',
      industry: 'Food Vendor & Restaurant',
      structure: 'sole_proprietor',
      vatRegistered: false,
      location: 'Orlando East',
      province: 'Gauteng',
      employeeCount: 2,
      annualTurnoverRange: 'R50,000 - R300,000 / year',
    };

    const transactions: FinancialTransaction[] = Array.from({ length: 25 }, (_, i) => ({
      id: `tx_${i}`,
      ownerUid: 'u1',
      businessId: 'b1',
      type: 'expense',
      status: 'paid',
      amount: 100 + i,
      currency: 'ZAR',
      category: i === 2 ? 'Transport' : 'Inventory and stock',
      description: i === 2 ? 'Flour delivery bakkie' : 'Bakery supplies',
      date: '2026-10-10',
    }));

    const documents: VaultDocument[] = [
      {
        id: 'd1',
        ownerUid: 'u1',
        businessId: 'b1',
        name: 'Shop Lease Agreement.pdf',
        category: 'Lease agreements',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        storageKey: 'lease.pdf',
        expiryDate: '2027-03-31',
        aiSummary: 'Monthly rent R4,500 expiring March 2027.',
      },
    ];

    const summary = computeFinancialAnalytics(transactions);
    const compliance = assessBusinessCompliance(business);
    const result = retrieveRelevantRecords('When does my lease expire?', {
      business,
      transactions,
      documents,
      compliance,
      summary,
    });

    expect(result.retrievedTransactions.length).toBeLessThanOrEqual(12);
    expect(result.retrievedDocuments[0].name).toBe('Shop Lease Agreement.pdf');
    expect(result.citations.some((c) => c.sourceType === 'document' && c.id === 'd1')).toBe(true);
  });
});

describe('Express API Security & Integration Routes', () => {
  it('serves health and compliance rules publicly while blocking unauthenticated protected routes', async () => {
    const http = await import('node:http');
    const { createApp } = await import('../server.ts');
    const app = createApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const healthRes = await fetch(`${baseUrl}/api/health`);
      expect(healthRes.status).toBe(200);
      expect(healthRes.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
      const healthJson = (await healthRes.json()) as { status: string };
      expect(healthJson.status).toBe('ok');

      const rulesRes = await fetch(`${baseUrl}/api/compliance/rules`);
      expect(rulesRes.status).toBe(200);
      const rulesJson = (await rulesRes.json()) as { rules: Array<{ id: string }> };
      expect(rulesJson.rules.length).toBeGreaterThanOrEqual(13);

      // Negative security tests: protected routes must reject missing bearer tokens
      const protectedEndpoints = [
        { method: 'POST', path: '/api/analytics/summary' },
        { method: 'POST', path: '/api/compliance/assess' },
        { method: 'POST', path: '/api/adviser/ask' },
        { method: 'GET', path: '/api/documents/biz_1/doc_1/download' },
        { method: 'DELETE', path: '/api/documents/biz_1/doc_1' },
      ];

      for (const ep of protectedEndpoints) {
        const res = await fetch(`${baseUrl}${ep.path}`, {
          method: ep.method,
          headers: { 'Content-Type': 'application/json' },
          body: ep.method === 'POST' ? JSON.stringify({}) : undefined,
        });
        expect(res.status).toBe(401);
        expect(res.headers.get('content-type')).toContain('application/json');
      }

      // Unmatched /api routes and malformed JSON bodies must return JSON, never HTML
      const notFoundRes = await fetch(`${baseUrl}/api/does-not-exist`);
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.headers.get('content-type')).toContain('application/json');
      const notFoundBody = (await notFoundRes.json()) as { error: string };
      expect(notFoundBody.error).toBeTruthy();

      const badJsonRes = await fetch(`${baseUrl}/api/security/validate-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid-json',
      });
      expect(badJsonRes.status).toBe(400);
      expect(badJsonRes.headers.get('content-type')).toContain('application/json');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
