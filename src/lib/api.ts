import type {
  AdviserResponse,
  BusinessProfile,
  ComplianceAssessmentItem,
  DocumentInterpretationResult,
  FinancialSummary,
  FinancialTransaction,
  ReceiptExtractionResult,
  VaultDocument,
} from '../../shared/types';
import { auth } from './firebase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to perform this action.');
  }
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function handleJsonResponse<T>(res: Response): Promise<T> {
  const rawText = await res.text();
  const contentType = res.headers.get('content-type') || '';
  const trimmed = rawText.trim();

  let parsed: unknown = null;
  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const errMessage =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error?: unknown }).error || '')
        : '';
    if (errMessage) {
      throw new Error(errMessage);
    }
    if (trimmed.startsWith('<') || contentType.includes('text/html')) {
      throw new Error(
        `Server returned an HTML error page instead of JSON (HTTP ${res.status}). Please refresh and try again.`
      );
    }
    throw new Error(`Request failed (HTTP ${res.status})${trimmed ? `: ${trimmed.slice(0, 140)}` : ''}`);
  }

  if (parsed === null) {
    if (trimmed.startsWith('<') || contentType.includes('text/html')) {
      throw new Error(
        `Unexpected HTML response from server (HTTP ${res.status}). Please refresh the page or sign in again.`
      );
    }
    throw new Error(`Invalid or empty JSON response from server (HTTP ${res.status}).`);
  }

  return parsed as T;
}

export async function scanReceiptApi(
  businessId: string,
  file: File,
  existingTransactions: FinancialTransaction[]
): Promise<{
  documentRecord: {
    id: string;
    storageKey: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    name: string;
  };
  extraction: ReceiptExtractionResult;
}> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('businessId', businessId);
  formData.append(
    'existingTransactions',
    JSON.stringify(
      existingTransactions.slice(0, 150).map((t) => ({
        id: t.id,
        date: t.date,
        amount: t.amount,
        merchantOrParty: t.merchantOrParty,
        description: t.description,
        receiptHash: t.receiptHash,
      }))
    )
  );

  const res = await fetch('/api/receipts/scan', {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'same-origin',
  });
  return handleJsonResponse(res);
}

export async function uploadDocumentApi(
  businessId: string,
  file: File,
  category?: string
): Promise<{
  documentRecord: {
    id: string;
    storageKey: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    name: string;
  };
  interpretation: DocumentInterpretationResult;
}> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('businessId', businessId);
  if (category) formData.append('category', category);

  const res = await fetch('/api/documents/upload', {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'same-origin',
  });
  return handleJsonResponse(res);
}

export async function downloadPrivateDocumentApi(
  businessId: string,
  docId: string,
  filename: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `/api/documents/${encodeURIComponent(businessId)}/${encodeURIComponent(docId)}/download`,
    { headers, credentials: 'same-origin' }
  );
  if (!res.ok) {
    const raw = await res.text();
    let msg = 'Could not download document.';
    try {
      const body = JSON.parse(raw) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // ignore non-json error body
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function deletePrivateDocumentApi(businessId: string, docId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `/api/documents/${encodeURIComponent(businessId)}/${encodeURIComponent(docId)}`,
    {
      method: 'DELETE',
      headers,
      credentials: 'same-origin',
    }
  );
  await handleJsonResponse(res);
}

export async function assessComplianceApi(
  business: BusinessProfile,
  savedProgress: Record<string, { status: string; linkedDocumentId?: string; renewalDate?: string; notes?: string }>
): Promise<{ items: ComplianceAssessmentItem[] }> {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const res = await fetch('/api/compliance/assess', {
    method: 'POST',
    headers,
    body: JSON.stringify({ business, savedProgress }),
    credentials: 'same-origin',
  });
  return handleJsonResponse(res);
}

export async function fetchAnalyticsSummaryApi(
  transactions: FinancialTransaction[],
  startDate?: string,
  endDate?: string
): Promise<FinancialSummary> {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const res = await fetch('/api/analytics/summary', {
    method: 'POST',
    headers,
    body: JSON.stringify({ transactions, startDate, endDate }),
    credentials: 'same-origin',
  });
  return handleJsonResponse(res);
}

export async function exportTransactionsCsvApi(transactions: FinancialTransaction[]): Promise<void> {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };
  const res = await fetch('/api/analytics/export-csv', {
    method: 'POST',
    headers,
    body: JSON.stringify({ transactions }),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('Failed to export CSV.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `townshipbiz-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function askAdviserApi(params: {
  question: string;
  business: BusinessProfile;
  transactions: FinancialTransaction[];
  documents: VaultDocument[];
  compliance: ComplianceAssessmentItem[];
}): Promise<AdviserResponse> {
  const headers = {
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  };

  // Compact payload to avoid oversized JSON bodies while preserving full retrieval metadata
  const compactPayload = {
    question: params.question,
    business: params.business,
    transactions: params.transactions.slice(0, 500),
    documents: params.documents.slice(0, 100).map((d) => ({
      id: d.id,
      ownerUid: d.ownerUid,
      businessId: d.businessId,
      name: d.name,
      category: d.category,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      storageKey: d.storageKey,
      issueDate: d.issueDate,
      expiryDate: d.expiryDate,
      issuingAuthority: d.issuingAuthority,
      aiSummary: d.aiSummary ? d.aiSummary.slice(0, 500) : undefined,
      extractedText: d.extractedText ? d.extractedText.slice(0, 1200) : undefined,
    })),
    compliance: params.compliance,
  };

  const res = await fetch('/api/adviser/ask', {
    method: 'POST',
    headers,
    body: JSON.stringify(compactPayload),
    credentials: 'same-origin',
  });
  return handleJsonResponse(res);
}
