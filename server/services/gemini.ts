import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AdviserCitation,
  AdviserResponse,
  BusinessProfile,
  ComplianceAssessmentItem,
  DocumentCategory,
  DocumentInterpretationResult,
  DuplicateCandidate,
  FinancialSummary,
  FinancialTransaction,
  ReceiptExtractionResult,
  VaultDocument,
} from '../../shared/types.ts';
import { DEFAULT_EXPENSE_CATEGORIES, DOCUMENT_CATEGORIES } from '../../shared/types.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function stripMarkdownAndParseJson<T>(rawText: string | undefined): T | null {
  if (!rawText || typeof rawText !== 'string') return null;
  let cleaned = rawText.trim();
  if (!cleaned) return null;

  // Strip ```json ... ``` or ``` ... ``` fences if present
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Attempt extracting outermost JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[R$\s,]/gi, '').trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

export function findDuplicateReceiptCandidates(
  extracted: {
    merchant: string | null;
    date: string | null;
    total: number | null;
    receiptNumber?: string | null;
  },
  existingTransactions: FinancialTransaction[],
  receiptHash?: string
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];

  for (const tx of existingTransactions) {
    if (receiptHash && tx.receiptHash && tx.receiptHash === receiptHash) {
      candidates.push({
        transactionId: tx.id,
        date: tx.date,
        amount: tx.amount,
        merchantOrParty: tx.merchantOrParty || tx.description,
        reason: 'Exact same receipt file hash already saved in your records.',
      });
      continue;
    }

    const sameAmount =
      typeof extracted.total === 'number' &&
      Math.abs(tx.amount - extracted.total) <= 0.05;
    const sameDate = Boolean(extracted.date && tx.date === extracted.date);
    const sameMerchant = Boolean(
      extracted.merchant &&
        tx.merchantOrParty &&
        tx.merchantOrParty.toLowerCase().includes(extracted.merchant.toLowerCase().slice(0, 6))
    );

    if (sameAmount && sameDate) {
      candidates.push({
        transactionId: tx.id,
        date: tx.date,
        amount: tx.amount,
        merchantOrParty: tx.merchantOrParty || tx.description,
        reason: sameMerchant
          ? 'Same merchant, date, and ZAR total found in existing transactions.'
          : 'Matching date and ZAR total found in existing transactions.',
      });
    }
  }

  return candidates;
}

function buildManualReceiptFallback(
  existingTransactions: FinancialTransaction[],
  receiptHash: string,
  warningMsg: string
): ReceiptExtractionResult {
  const today = new Date().toISOString().slice(0, 10);
  return {
    merchant: null,
    date: today,
    receiptNumber: null,
    lineItems: [],
    subtotal: null,
    discounts: null,
    vatAmount: null,
    total: null,
    paymentMethod: null,
    suggestedCategory: 'Other expenses',
    rawText: '',
    confidence: {
      merchant: 'low',
      date: 'low',
      total: 'low',
      vatAmount: 'low',
      overall: 'low',
    },
    warnings: [warningMsg],
    duplicateCandidates: findDuplicateReceiptCandidates(
      { merchant: null, date: null, total: null },
      existingTransactions,
      receiptHash
    ),
    usedFallback: true,
  };
}

export async function extractReceiptWithAI(
  fileBuffer: Buffer,
  mimeType: string,
  existingTransactions: FinancialTransaction[],
  receiptHash: string
): Promise<ReceiptExtractionResult> {
  const ai = getGeminiClient();

  if (!ai) {
    return buildManualReceiptFallback(
      existingTransactions,
      receiptHash,
      'Automated OCR is unavailable because GEMINI_API_KEY is not configured. Enter fields manually and confirm.'
    );
  }

  const base64Data = fileBuffer.toString('base64');
  const prompt = `Extract receipt or till-slip data for a South African small business.
Rules:
- Currency is South African Rand (ZAR). Return numeric values without currency symbols.
- Do NOT assume VAT was charged. Only populate vatAmount if VAT is explicitly printed on the receipt (e.g. "VAT 15%", "TAX", "VAT Incl"). Otherwise return null.
- Date format: YYYY-MM-DD if clearly visible, else null.
- Suggest the closest category from: ${DEFAULT_EXPENSE_CATEGORIES.join(', ')}.
- Assign honest confidence levels ('high', 'medium', 'low') for merchant, date, total, vatAmount, and overall.
- If text is blurry or missing, add a clear plain-language warning.`;

  const safeMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: safeMime,
              data: base64Data,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchant: { type: Type.STRING, nullable: true },
            date: { type: Type.STRING, nullable: true },
            receiptNumber: { type: Type.STRING, nullable: true },
            lineItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  quantity: { type: Type.NUMBER, nullable: true },
                  unitPrice: { type: Type.NUMBER, nullable: true },
                  lineTotal: { type: Type.NUMBER, nullable: true },
                },
              },
            },
            subtotal: { type: Type.NUMBER, nullable: true },
            discounts: { type: Type.NUMBER, nullable: true },
            vatAmount: { type: Type.NUMBER, nullable: true },
            total: { type: Type.NUMBER, nullable: true },
            paymentMethod: { type: Type.STRING, nullable: true },
            suggestedCategory: { type: Type.STRING },
            rawText: { type: Type.STRING },
            confidence: {
              type: Type.OBJECT,
              properties: {
                merchant: { type: Type.STRING },
                date: { type: Type.STRING },
                total: { type: Type.STRING },
                vatAmount: { type: Type.STRING },
                overall: { type: Type.STRING },
              },
            },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    });

    const parsed = stripMarkdownAndParseJson<Partial<ReceiptExtractionResult>>(response.text);
    if (!parsed) {
      return buildManualReceiptFallback(
        existingTransactions,
        receiptHash,
        'Could not automatically parse all fields from this receipt image. Please enter or verify the details manually below.'
      );
    }

    const lineItems = Array.isArray(parsed.lineItems)
      ? parsed.lineItems.map((li) => ({
          description: typeof li?.description === 'string' ? li.description : 'Item',
          quantity: parseOptionalNumber(li?.quantity),
          unitPrice: parseOptionalNumber(li?.unitPrice),
          lineTotal: parseOptionalNumber(li?.lineTotal),
        }))
      : [];

    const normalized: ReceiptExtractionResult = {
      merchant: typeof parsed.merchant === 'string' && parsed.merchant.trim() ? parsed.merchant.trim() : null,
      date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date.trim()) ? parsed.date.trim() : null,
      receiptNumber: typeof parsed.receiptNumber === 'string' && parsed.receiptNumber.trim() ? parsed.receiptNumber.trim() : null,
      lineItems,
      subtotal: parseOptionalNumber(parsed.subtotal),
      discounts: parseOptionalNumber(parsed.discounts),
      vatAmount: parseOptionalNumber(parsed.vatAmount),
      total: parseOptionalNumber(parsed.total),
      paymentMethod: typeof parsed.paymentMethod === 'string' && parsed.paymentMethod.trim() ? parsed.paymentMethod.trim() : null,
      suggestedCategory:
        parsed.suggestedCategory &&
        (DEFAULT_EXPENSE_CATEGORIES as readonly string[]).includes(parsed.suggestedCategory)
          ? parsed.suggestedCategory
          : 'Other expenses',
      rawText: typeof parsed.rawText === 'string' ? parsed.rawText : '',
      confidence: {
        merchant: normalizeConf(parsed.confidence?.merchant),
        date: normalizeConf(parsed.confidence?.date),
        total: normalizeConf(parsed.confidence?.total),
        vatAmount: normalizeConf(parsed.confidence?.vatAmount),
        overall: normalizeConf(parsed.confidence?.overall),
      },
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
      duplicateCandidates: [],
    };

    normalized.duplicateCandidates = findDuplicateReceiptCandidates(
      normalized,
      existingTransactions,
      receiptHash
    );
    if (normalized.duplicateCandidates.length > 0) {
      normalized.warnings.unshift(
        `Possible duplicate detected (${normalized.duplicateCandidates.length} matching existing transaction). Review before saving.`
      );
    }

    return normalized;
  } catch (err) {
    console.error('Receipt OCR failed:', err);
    const msg = err instanceof Error ? err.message : 'Unexpected OCR error.';
    throw new Error(`Receipt extraction failed: ${msg}`);
  }
}

function normalizeConf(v: unknown): 'high' | 'medium' | 'low' {
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  return 'medium';
}

export async function interpretDocumentWithAI(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
  requestedCategory?: string
): Promise<DocumentInterpretationResult> {
  const ai = getGeminiClient();
  const legalDisclaimer =
    'AI summary for informational support only — this is not formal legal, accounting, or tax advice and does not certify contract enforceability.';

  if (!ai) {
    return {
      suggestedCategory: validateDocCategory(requestedCategory),
      summary: `Uploaded file "${filename}" stored securely in your private vault. Configure GEMINI_API_KEY to enable automated AI interpretation.`,
      extractedText: '',
      amounts: [],
      keyDates: [],
      issueDate: null,
      expiryDate: null,
      renewalDate: null,
      issuingAuthority: null,
      paymentObligations: [],
      importantClauses: [],
      missingInfo: ['Automated AI extraction skipped (no GEMINI_API_KEY configured).'],
      suggestedAction: { type: 'none', label: 'No automated follow-up detected' },
      legalDisclaimer,
    };
  }

  const prompt = `Analyse this South African business document (${filename}).
1. Classify it into one of these exact categories: ${DOCUMENT_CATEGORIES.join(', ')}.
2. Provide a plain-language summary understandable to a small business owner.
3. Extract readable text highlights, ZAR/currency amounts, issue date (YYYY-MM-DD), expiry date (YYYY-MM-DD), renewal date (YYYY-MM-DD), and issuing authority (e.g. CIPC, SARS, City of Johannesburg, Landlord, Supplier).
4. List payment obligations, important clauses, and any potentially missing details (e.g. missing signature, missing expiry date, unclear VAT number).
5. If this is a Supplier invoice with an amount/due date, set suggestedAction.type = 'create_payable'. If it is a Trading permit, Registration certificate, or Food COA with an expiry/renewal date, set suggestedAction.type = 'create_compliance_reminder'. Otherwise 'none'.
6. Never claim a contract is legally valid or enforceable.`;

  const safeMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;

  try {
    const parts =
      safeMime.startsWith('text/')
        ? [{ text: `${prompt}\n\nDocument text:\n${fileBuffer.toString('utf8').slice(0, 18000)}` }]
        : [
            {
              inlineData: {
                mimeType: safeMime,
                data: fileBuffer.toString('base64'),
              },
            },
            { text: prompt },
          ];

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedCategory: { type: Type.STRING },
            summary: { type: Type.STRING },
            extractedText: { type: Type.STRING },
            amounts: { type: Type.ARRAY, items: { type: Type.STRING } },
            keyDates: { type: Type.ARRAY, items: { type: Type.STRING } },
            issueDate: { type: Type.STRING, nullable: true },
            expiryDate: { type: Type.STRING, nullable: true },
            renewalDate: { type: Type.STRING, nullable: true },
            issuingAuthority: { type: Type.STRING, nullable: true },
            paymentObligations: { type: Type.ARRAY, items: { type: Type.STRING } },
            importantClauses: { type: Type.ARRAY, items: { type: Type.STRING } },
            missingInfo: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedActionType: { type: Type.STRING },
            suggestedActionLabel: { type: Type.STRING },
            suggestedAmount: { type: Type.NUMBER, nullable: true },
            suggestedSupplier: { type: Type.STRING, nullable: true },
            suggestedDueDate: { type: Type.STRING, nullable: true },
          },
        },
      },
    });

    const raw = stripMarkdownAndParseJson<Record<string, unknown>>(response.text) || {};
    const actionType =
      raw.suggestedActionType === 'create_payable' || raw.suggestedActionType === 'create_compliance_reminder'
        ? raw.suggestedActionType
        : 'none';

    return {
      suggestedCategory: validateDocCategory(
        typeof raw.suggestedCategory === 'string' ? raw.suggestedCategory : requestedCategory
      ),
      summary: typeof raw.summary === 'string' && raw.summary ? raw.summary : `Document "${filename}" stored and processed.`,
      extractedText: typeof raw.extractedText === 'string' ? raw.extractedText.slice(0, 15000) : '',
      amounts: Array.isArray(raw.amounts) ? raw.amounts.map(String) : [],
      keyDates: Array.isArray(raw.keyDates) ? raw.keyDates.map(String) : [],
      issueDate: typeof raw.issueDate === 'string' ? raw.issueDate : null,
      expiryDate: typeof raw.expiryDate === 'string' ? raw.expiryDate : null,
      renewalDate: typeof raw.renewalDate === 'string' ? raw.renewalDate : null,
      issuingAuthority: typeof raw.issuingAuthority === 'string' ? raw.issuingAuthority : null,
      paymentObligations: Array.isArray(raw.paymentObligations) ? raw.paymentObligations.map(String) : [],
      importantClauses: Array.isArray(raw.importantClauses) ? raw.importantClauses.map(String) : [],
      missingInfo: Array.isArray(raw.missingInfo) ? raw.missingInfo.map(String) : [],
      suggestedAction: {
        type: actionType,
        label:
          typeof raw.suggestedActionLabel === 'string' && raw.suggestedActionLabel
            ? raw.suggestedActionLabel
            : actionType === 'create_payable'
            ? 'Create supplier payable record from this invoice'
            : actionType === 'create_compliance_reminder'
            ? 'Create compliance renewal reminder'
            : 'No follow-up action required',
        payload: {
          amount: parseOptionalNumber(raw.suggestedAmount),
          supplier: typeof raw.suggestedSupplier === 'string' ? raw.suggestedSupplier : null,
          dueDate: typeof raw.suggestedDueDate === 'string' ? raw.suggestedDueDate : null,
          expiryDate: typeof raw.expiryDate === 'string' ? raw.expiryDate : null,
          issuingAuthority: typeof raw.issuingAuthority === 'string' ? raw.issuingAuthority : null,
        },
      },
      legalDisclaimer,
    };
  } catch (err) {
    console.error('Document interpretation failed:', err);
    throw new Error(
      err instanceof Error ? `Document interpretation failed: ${err.message}` : 'Document interpretation failed.'
    );
  }
}

function validateDocCategory(cat?: string): DocumentCategory {
  if (cat && (DOCUMENT_CATEGORIES as readonly string[]).includes(cat)) {
    return cat as DocumentCategory;
  }
  return 'Other business records';
}

export function retrieveRelevantRecords(
  question: string,
  params: {
    business: BusinessProfile;
    transactions: FinancialTransaction[];
    documents: VaultDocument[];
    compliance: ComplianceAssessmentItem[];
    summary: FinancialSummary;
  }
): {
  retrievedTransactions: FinancialTransaction[];
  retrievedDocuments: VaultDocument[];
  retrievedCompliance: ComplianceAssessmentItem[];
  citations: AdviserCitation[];
} {
  const q = question.toLowerCase();
  const terms = q
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

  // Score and select only top relevant transactions (never dump entire DB)
  const scoredTx = params.transactions
    .map((tx) => {
      const hay = `${tx.category} ${tx.description} ${tx.merchantOrParty || ''} ${tx.date} ${tx.status} ${tx.type}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (hay.includes(term)) score += 2;
      }
      if (q.includes('spend') || q.includes('expense') || q.includes('earn') || q.includes('month') || q.includes('perform')) {
        score += 1;
      }
      if (q.includes('unpaid') || q.includes('invoice') || q.includes('owe')) {
        if (tx.status !== 'paid') score += 4;
      }
      return { tx, score };
    })
    .sort((a, b) => b.score - a.score || (b.tx.date || '').localeCompare(a.tx.date || ''))
    .slice(0, 12)
    .map((s) => s.tx);

  // Score and select relevant documents (max 6)
  const scoredDocs = params.documents
    .map((doc) => {
      const hay = `${doc.name} ${doc.category} ${doc.aiSummary || ''} ${doc.extractedText || ''} ${doc.expiryDate || ''} ${doc.issuingAuthority || ''}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (hay.includes(term)) score += 3;
      }
      if (q.includes('expir') && doc.expiryDate) score += 5;
      if (q.includes('missing') || q.includes('document')) score += 1;
      return { doc, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s) => s.doc);

  // Select relevant compliance items (max 6)
  const scoredCompliance = params.compliance
    .map((item) => {
      const ruleName = item.rule?.name || '';
      const ruleArea = item.rule?.area || '';
      const hay = `${ruleName} ${ruleArea} ${item.classification} ${item.savedStatus} ${item.reason || ''}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (hay.includes(term)) score += 3;
      }
      if (item.classification === 'mandatory' && item.savedStatus !== 'completed') score += 2;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s) => s.item);

  const citations: AdviserCitation[] = [
    {
      sourceType: 'business_profile',
      id: params.business.id,
      label: `${params.business.name} (${params.business.structure}, ${params.business.province})`,
      excerpt: `Industry: ${params.business.industry} · Employees: ${params.business.employeeCount} · Turnover: ${params.business.annualTurnoverRange}`,
    },
    ...scoredTx.slice(0, 4).map((tx) => ({
      sourceType: 'transaction' as const,
      id: tx.id,
      label: `${tx.date} · ${tx.merchantOrParty || tx.description}`,
      excerpt: `${tx.type} (${tx.status}) · R${Number(tx.amount || 0).toFixed(2)} · ${tx.category}`,
    })),
    ...scoredDocs.slice(0, 3).map((d) => ({
      sourceType: 'document' as const,
      id: d.id,
      label: `${d.name} (${d.category})`,
      excerpt: d.expiryDate
        ? `Expires ${d.expiryDate} · ${d.aiSummary || 'Stored in vault'}`.slice(0, 140)
        : (d.aiSummary || 'Stored in vault').slice(0, 140),
    })),
    ...scoredCompliance.slice(0, 3).map((c) => ({
      sourceType: 'compliance' as const,
      id: c.rule?.id || 'rule',
      label: `${c.rule?.name || 'Compliance rule'} [${c.classification}]`,
      excerpt: `Status: ${c.savedStatus} · ${c.rule?.officialSourceName || 'SA regulation'}`,
    })),
  ];

  return {
    retrievedTransactions: scoredTx,
    retrievedDocuments: scoredDocs,
    retrievedCompliance: scoredCompliance,
    citations,
  };
}

export async function askBusinessAdviserAI(
  question: string,
  params: {
    business: BusinessProfile;
    transactions: FinancialTransaction[];
    documents: VaultDocument[];
    compliance: ComplianceAssessmentItem[];
    summary: FinancialSummary;
  }
): Promise<AdviserResponse> {
  const retrieved = retrieveRelevantRecords(question, params);
  const ai = getGeminiClient();

  const wantsMutation = /\b(mark|record|create|add|delete|update|change|log)\b/i.test(question);

  if (!ai) {
    const { summary } = params;
    const answerParts = [
      `Based on your verified records for ${params.business.name}:`,
      `• Paid income: R${summary.totalIncome.toFixed(2)} | Paid expenses: R${summary.totalExpenses.toFixed(2)} | Net cash movement: R${summary.netCashMovement.toFixed(2)}.`,
      `• Outstanding receivables: R${summary.outstandingReceivables.toFixed(2)} | Outstanding payables: R${summary.outstandingPayables.toFixed(2)}.`,
    ];
    if (retrieved.retrievedDocuments.length > 0) {
      answerParts.push(
        `• Matching vault documents: ${retrieved.retrievedDocuments
          .map((d) => `${d.name}${d.expiryDate ? ` (expires ${d.expiryDate})` : ''}`)
          .join('; ')}.`
      );
    }
    const pendingMandatory = params.compliance.filter(
      (c) => c.classification === 'mandatory' && c.savedStatus !== 'completed'
    );
    if (pendingMandatory.length > 0) {
      answerParts.push(
        `• Pending mandatory compliance items (${pendingMandatory.length}): ${pendingMandatory
          .slice(0, 3)
          .map((c) => c.rule?.name || '')
          .filter(Boolean)
          .join(', ')}.`
      );
    }

    return {
      answer: answerParts.join('\n'),
      citations: retrieved.citations,
      distinctions:
        'All figures above come directly from your stored transactions, vault metadata, and deterministic South African compliance rules. AI narrative synthesis requires GEMINI_API_KEY.',
      ...(wantsMutation
        ? {
            proposedAction: {
              requiresConfirmation: true,
              actionType: 'review_before_change',
              description: 'Confirm before modifying any financial or compliance records.',
              payload: { question },
            },
          }
        : {}),
    };
  }

  const contextPayload = {
    business: {
      name: params.business.name,
      industry: params.business.industry,
      structure: params.business.structure,
      location: params.business.location,
      province: params.business.province,
      employeeCount: params.business.employeeCount,
      annualTurnoverRange: params.business.annualTurnoverRange,
      vatRegistered: params.business.vatRegistered,
    },
    financialSummary: {
      totalIncomeZAR: params.summary.totalIncome,
      totalExpensesZAR: params.summary.totalExpenses,
      netCashMovementZAR: params.summary.netCashMovement,
      outstandingReceivablesZAR: params.summary.outstandingReceivables,
      outstandingPayablesZAR: params.summary.outstandingPayables,
      monthlyComparison: params.summary.monthlyComparison,
      categoryBreakdown: params.summary.categoryBreakdown,
      insights: params.summary.insights.map((i) => ({ title: i.title, whatDetected: i.whatDetected })),
    },
    relevantTransactions: retrieved.retrievedTransactions.map((t) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      status: t.status,
      amountZAR: t.amount,
      category: t.category,
      party: t.merchantOrParty,
      description: t.description,
    })),
    relevantDocuments: retrieved.retrievedDocuments.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      issueDate: d.issueDate,
      expiryDate: d.expiryDate,
      summary: d.aiSummary,
      textExcerpt: d.extractedText?.slice(0, 600),
    })),
    relevantCompliance: retrieved.retrievedCompliance.map((c) => ({
      id: c.rule?.id || 'rule',
      name: c.rule?.name || 'Compliance rule',
      classification: c.classification,
      savedStatus: c.savedStatus,
      reason: c.reason,
      source: c.rule?.officialSourceName || '',
    })),
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `User question: ${question}\n\nRetrieved authorised business records:\n${JSON.stringify(contextPayload)}`,
      config: {
        systemInstruction: `You are TownshipBiz Business Adviser for a South African small business owner.
Rules:
1. Answer ONLY using the provided retrieved records and deterministic compliance rules.
2. Always cite the supporting document names, transaction dates/amounts, or compliance rule names in your answer.
3. Clearly distinguish verified recorded data from estimates or missing records. If there are 0 transactions recorded so far, state that clearly and warmly without inventing figures.
4. Never fabricate ZAR figures, SARS thresholds, municipal bylaws, or legal/tax advice.
5. Keep language plain, warm, practical, and tailored to South Africa (use ZAR / R formatting).
6. If the user asks to modify or add a financial or compliance record, explain what would change and state that explicit confirmation is required first.`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const answerText = typeof response.text === 'string' ? response.text.trim() : '';

    return {
      answer:
        answerText ||
        `For ${params.business.name}, your paid income is R${params.summary.totalIncome.toFixed(2)} and paid expenses are R${params.summary.totalExpenses.toFixed(2)}.`,
      citations: retrieved.citations,
      distinctions:
        'Verified values are drawn directly from your recorded ZAR ledger, uploaded documents, and structured South African compliance rules. Advisory notes are not formal legal or tax advice.',
      ...(wantsMutation
        ? {
            proposedAction: {
              requiresConfirmation: true,
              actionType: 'review_before_change',
              description: 'Please confirm in the Finances or Compliance view before changing saved records.',
              payload: { question },
            },
          }
        : {}),
    };
  } catch (err) {
    console.error('Adviser AI failed:', err);
    throw new Error(
      err instanceof Error ? `Business adviser failed: ${err.message}` : 'Business adviser request failed.'
    );
  }
}
