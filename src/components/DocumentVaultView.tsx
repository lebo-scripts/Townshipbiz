import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileCheck2,
  FileUp,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  BusinessProfile,
  DocumentCategory,
  DocumentInterpretationResult,
  VaultDocument,
} from '../../shared/types';
import { DOCUMENT_CATEGORIES, formatZAR } from '../../shared/types';
import {
  deletePrivateDocumentApi,
  downloadPrivateDocumentApi,
  uploadDocumentApi,
} from '../lib/api';
import {
  createNotification,
  removeVaultDocumentMetadata,
  saveComplianceProgress,
  saveTransaction,
  saveVaultDocumentMetadata,
} from '../lib/db';

interface DocumentVaultViewProps {
  business: BusinessProfile;
  uid: string;
  documents: VaultDocument[];
  onNavigate: (tab: string) => void;
}

export function DocumentVaultView({
  business,
  uid,
  documents,
  onNavigate,
}: DocumentVaultViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | ''>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestInterpretation, setLatestInterpretation] = useState<{
    docId: string;
    name: string;
    result: DocumentInterpretationResult;
  } | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const sixtyDaysOut = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  const filteredDocs = useMemo(() => {
    return documents
      .filter((doc) => {
        if (filterCategory !== 'all' && doc.category !== filterCategory) return false;
        if (expiringOnly && (!doc.expiryDate || doc.expiryDate < todayStr || doc.expiryDate > sixtyDaysOut)) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          const hay = `${doc.name} ${doc.category} ${doc.aiSummary || ''} ${doc.extractedText || ''} ${doc.issuingAuthority || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [documents, filterCategory, expiringOnly, search, todayStr, sixtyDaysOut]);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setActionMsg(null);
    setUploading(true);
    try {
      const res = await uploadDocumentApi(business.id, file, selectedCategory || undefined);
      const interp = res.interpretation;

      await saveVaultDocumentMetadata(business.id, uid, {
        id: res.documentRecord.id,
        name: res.documentRecord.name,
        category: selectedCategory || interp.suggestedCategory,
        mimeType: res.documentRecord.mimeType,
        sizeBytes: res.documentRecord.sizeBytes,
        storageKey: res.documentRecord.storageKey,
        sha256: res.documentRecord.sha256,
        extractedText: interp.extractedText,
        aiSummary: interp.summary,
        keyDates: interp.keyDates,
        amounts: interp.amounts,
        paymentObligations: interp.paymentObligations,
        importantClauses: interp.importantClauses,
        missingInfo: interp.missingInfo,
        ...(interp.issueDate ? { issueDate: interp.issueDate } : {}),
        ...(interp.expiryDate ? { expiryDate: interp.expiryDate } : {}),
        ...(interp.issuingAuthority ? { issuingAuthority: interp.issuingAuthority } : {}),
        legalDisclaimer: interp.legalDisclaimer,
      });

      setLatestInterpretation({
        docId: res.documentRecord.id,
        name: res.documentRecord.name,
        result: interp,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleCreatePayableFromDoc = async () => {
    if (!latestInterpretation) return;
    const payload = latestInterpretation.result.suggestedAction.payload || {};
    const amount = Number(payload.amount) || 0;
    const supplier = String(payload.supplier || 'Supplier from uploaded invoice');
    const dueDate = payload.dueDate ? String(payload.dueDate) : undefined;

    await saveTransaction(business.id, uid, {
      type: 'payable',
      status: 'pending',
      amount: amount > 0 ? amount : 1,
      currency: 'ZAR',
      category: 'Inventory and stock',
      description: `Payable from ${latestInterpretation.name}`,
      merchantOrParty: supplier,
      paymentMethod: 'EFT',
      date: new Date().toISOString().slice(0, 10),
      ...(dueDate ? { dueDate } : {}),
      receiptDocumentId: latestInterpretation.docId,
    });
    setActionMsg(
      `Created supplier payable (${supplier}${amount > 0 ? ` · ${formatZAR(amount)}` : ''}) in Finances.`
    );
  };

  const handleCreateComplianceReminderFromDoc = async () => {
    if (!latestInterpretation) return;
    const expiryDate = latestInterpretation.result.expiryDate || undefined;
    const ruleId =
      latestInterpretation.result.suggestedCategory === 'Trading permits'
        ? 'municipal-trading-permit'
        : 'cipc-registration-annual-return';

    await saveComplianceProgress(business.id, uid, {
      ruleId,
      status: 'completed',
      linkedDocumentId: latestInterpretation.docId,
      ...(expiryDate ? { renewalDate: expiryDate } : {}),
      notes: `Linked from ${latestInterpretation.name}`,
    });

    await createNotification(business.id, uid, {
      type: 'document_expiry',
      title: `Permit / certificate tracked: ${latestInterpretation.name}`,
      message: expiryDate
        ? `Expiry / renewal date recorded as ${expiryDate}.`
        : 'Document linked to your compliance checklist.',
      severity: 'info',
      read: false,
      actionTab: 'compliance',
    });
    setActionMsg('Linked document to Compliance Checklist and created renewal reminder.');
  };

  const handleDownload = async (doc: VaultDocument) => {
    setError(null);
    try {
      await downloadPrivateDocumentApi(business.id, doc.id, doc.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const handleDelete = async (doc: VaultDocument) => {
    setError(null);
    try {
      await deletePrivateDocumentApi(business.id, doc.id);
      await removeVaultDocumentMetadata(business.id, uid, doc.id);
      if (selectedDoc?.id === doc.id) setSelectedDoc(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Secure Intelligent Document Vault</h1>
        <p className="mt-1 text-sm text-slate-600">
          Private storage with AI classification, date & amount extraction, expiry tracking, and zero
          public file links.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      {actionMsg && (
        <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          <span>{actionMsg}</span>
          <button
            type="button"
            onClick={() => onNavigate('finances')}
            className="font-semibold underline cursor-pointer"
          >
            View
          </button>
        </div>
      )}

      {/* Upload Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-700">
              Document category (leave automatic for AI classification)
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as DocumentCategory | '')}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Auto-detect category with AI</option>
              {DOCUMENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <label className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer whitespace-nowrap">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            <span>{uploading ? 'Analysing & Encrypting...' : 'Upload Document (PDF/Image/TXT)'}</span>
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,text/plain,text/csv"
              className="sr-only"
              onChange={(e) => {
                handleUpload(e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* Latest AI Interpretation Card */}
      {latestInterpretation && (
        <div className="rounded-xl border border-teal-200 bg-white p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-teal-800">
                AI Interpretation · {latestInterpretation.result.suggestedCategory}
              </p>
              <h2 className="text-base font-bold text-slate-900">{latestInterpretation.name}</h2>
            </div>
            {latestInterpretation.result.suggestedAction.type === 'create_payable' && (
              <button
                type="button"
                onClick={handleCreatePayableFromDoc}
                className="min-h-[40px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                Create Payable Record
              </button>
            )}
            {latestInterpretation.result.suggestedAction.type === 'create_compliance_reminder' && (
              <button
                type="button"
                onClick={handleCreateComplianceReminderFromDoc}
                className="min-h-[40px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
              >
                Link Compliance Reminder
              </button>
            )}
          </div>

          <p className="text-sm text-slate-700">{latestInterpretation.result.summary}</p>

          <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-3 border-t border-slate-100 pt-3">
            <div>
              <p className="font-semibold text-slate-800">Extracted Dates</p>
              <p className="mt-1 text-slate-600">
                Issue: {latestInterpretation.result.issueDate || 'Not found'} · Expiry:{' '}
                {latestInterpretation.result.expiryDate || 'Not found'}
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Amounts & Obligations</p>
              <p className="mt-1 text-slate-600">
                {latestInterpretation.result.amounts.join(', ') ||
                  latestInterpretation.result.paymentObligations.join('; ') ||
                  'None detected'}
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Missing / Unclear Info</p>
              <p className="mt-1 text-slate-600">
                {latestInterpretation.result.missingInfo.join('; ') || 'No gaps flagged'}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-500 border-t border-slate-100 pt-2">
            {latestInterpretation.result.legalDisclaimer}
          </p>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents by name, category, summary, or authority..."
            className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="all">All 15 categories</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setExpiringOnly((v) => !v)}
          className={`min-h-[44px] rounded-lg border px-4 text-sm font-medium cursor-pointer whitespace-nowrap ${
            expiringOnly
              ? 'border-amber-600 bg-amber-50 text-amber-800'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Expiring within 60 days
        </button>
      </div>

      {/* Vault List + Detail Drawer */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {filteredDocs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No documents match your filter. Upload permits, supplier invoices, leases, or tax records above.
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const isExpiring =
                doc.expiryDate && doc.expiryDate >= todayStr && doc.expiryDate <= sixtyDaysOut;
              return (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between gap-4 p-4 hover:bg-slate-50 ${
                    selectedDoc?.id === doc.id ? 'bg-slate-50' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDoc(doc)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="h-4 w-4 shrink-0 text-teal-700" />
                      <span className="truncate text-sm font-semibold text-slate-900">{doc.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 truncate">
                      {doc.category} · {(doc.sizeBytes / 1024).toFixed(1)} KB
                      {doc.expiryDate ? ` · Expires ${doc.expiryDate}` : ''}
                    </p>
                    {isExpiring && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Expiring within 60 days</span>
                      </p>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      aria-label="Download private document"
                      className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      aria-label="Delete document"
                      className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5">
          {!selectedDoc ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Select a document from the vault to inspect its AI summary, key clauses, dates, and
              supporting metadata.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500">
                  {selectedDoc.category} · {selectedDoc.mimeType}
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-900">{selectedDoc.name}</h3>
              </div>

              {selectedDoc.aiSummary && (
                <div>
                  <p className="text-xs font-semibold text-slate-700">AI Summary</p>
                  <p className="mt-1 text-sm text-slate-700 leading-relaxed">{selectedDoc.aiSummary}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                <div>
                  <span className="text-slate-500">Issue Date</span>
                  <p className="font-mono font-medium text-slate-900">{selectedDoc.issueDate || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Expiry Date</span>
                  <p className="font-mono font-medium text-slate-900">{selectedDoc.expiryDate || '-'}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Issuing Authority</span>
                  <p className="font-medium text-slate-900">{selectedDoc.issuingAuthority || '-'}</p>
                </div>
              </div>

              {selectedDoc.importantClauses && selectedDoc.importantClauses.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-700">Key Clauses & Obligations</p>
                  <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                    {selectedDoc.importantClauses.map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDoc.legalDisclaimer && (
                <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                  {selectedDoc.legalDisclaimer}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleDownload(selectedDoc)}
                  className="min-h-[44px] flex-1 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer"
                >
                  Secure Download
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
