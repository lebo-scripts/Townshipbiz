import React, { useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import type {
  BusinessProfile,
  FinancialTransaction,
  ReceiptExtractionResult,
} from '../../shared/types';
import { DEFAULT_EXPENSE_CATEGORIES, formatZAR } from '../../shared/types';
import { scanReceiptApi } from '../lib/api';
import { saveTransaction, saveVaultDocumentMetadata } from '../lib/db';

interface ReceiptScannerViewProps {
  business: BusinessProfile;
  uid: string;
  transactions: FinancialTransaction[];
  onSaved: () => void;
}

interface PendingReceiptReview {
  fileName: string;
  docRecord?: {
    id: string;
    storageKey: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    name: string;
  };
  extraction: ReceiptExtractionResult;
  // Editable review form state
  merchant: string;
  date: string;
  total: string;
  vatAmount: string;
  category: string;
  paymentMethod: string;
  description: string;
}

export function ReceiptScannerView({
  business,
  uid,
  transactions,
  onSaved,
}: ReceiptScannerViewProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<PendingReceiptReview[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setScanning(true);

    try {
      const nextReviews: PendingReceiptReview[] = [];
      for (const file of Array.from(files).slice(0, 5)) {
        const res = await scanReceiptApi(business.id, file, transactions);
        const ext = res.extraction;
        nextReviews.push({
          fileName: file.name,
          docRecord: res.documentRecord,
          extraction: ext,
          merchant: ext.merchant || '',
          date: ext.date || new Date().toISOString().slice(0, 10),
          total: typeof ext.total === 'number' ? String(ext.total) : '',
          vatAmount: typeof ext.vatAmount === 'number' ? String(ext.vatAmount) : '',
          category: ext.suggestedCategory || 'Other expenses',
          paymentMethod: ext.paymentMethod || 'Cash',
          description: ext.lineItems.length > 0
            ? ext.lineItems.slice(0, 3).map((i) => i.description).join(', ')
            : `Receipt from ${ext.merchant || file.name}`,
        });
      }
      setQueue((prev) => [...prev, ...nextReviews]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan receipt.');
    } finally {
      setScanning(false);
    }
  };

  const addManualReceiptReview = () => {
    setError(null);
    setQueue((prev) => [
      ...prev,
      {
        fileName: 'Manual receipt entry',
        extraction: {
          merchant: null,
          date: new Date().toISOString().slice(0, 10),
          receiptNumber: null,
          lineItems: [],
          subtotal: null,
          discounts: null,
          vatAmount: null,
          total: null,
          paymentMethod: 'Cash',
          suggestedCategory: 'Other expenses',
          rawText: '',
          confidence: {
            merchant: 'low',
            date: 'low',
            total: 'low',
            vatAmount: 'low',
            overall: 'low',
          },
          warnings: ['Manual receipt entry — fill in the merchant, date, and ZAR total below to save.'],
          duplicateCandidates: [],
          usedFallback: true,
        },
        merchant: '',
        date: new Date().toISOString().slice(0, 10),
        total: '',
        vatAmount: '',
        category: 'Other expenses',
        paymentMethod: 'Cash',
        description: '',
      },
    ]);
  };

  const updateItem = (idx: number, patch: Partial<PendingReceiptReview>) => {
    setQueue((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const handleConfirmAndSave = async (idx: number) => {
    const item = queue[idx];
    const numericTotal = Number(item.total);
    if (!Number.isFinite(numericTotal) || numericTotal <= 0) {
      setError('Please enter a valid ZAR total amount before confirming.');
      return;
    }

    setError(null);
    setSavingIdx(idx);
    try {
      const txId = await saveTransaction(business.id, uid, {
        type: 'expense',
        status: 'paid',
        amount: numericTotal,
        ...(item.vatAmount ? { vatAmount: Number(item.vatAmount) || 0 } : {}),
        currency: 'ZAR',
        category: item.category,
        description: item.description.trim() || `Receipt from ${item.merchant || 'Supplier'}`,
        merchantOrParty: item.merchant.trim() || 'Unspecified supplier',
        paymentMethod: item.paymentMethod,
        date: item.date,
        ...(item.docRecord
          ? {
              receiptDocumentId: item.docRecord.id,
              receiptHash: item.docRecord.sha256,
            }
          : {}),
        ocrVerified: Boolean(item.docRecord),
      });

      if (item.docRecord) {
        await saveVaultDocumentMetadata(business.id, uid, {
          id: item.docRecord.id,
          name: item.docRecord.name,
          category: 'Receipts',
          mimeType: item.docRecord.mimeType,
          sizeBytes: item.docRecord.sizeBytes,
          storageKey: item.docRecord.storageKey,
          sha256: item.docRecord.sha256,
          extractedText: item.extraction.rawText,
          aiSummary: `Confirmed receipt from ${item.merchant || 'Supplier'} for ${formatZAR(numericTotal)} on ${item.date}.`,
          issueDate: item.date,
          linkedTransactionId: txId,
        });
      }

      setQueue((prev) => prev.filter((_, i) => i !== idx));
      setConfirmedCount((c) => c + 1);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save confirmed receipt.');
    } finally {
      setSavingIdx(null);
    }
  };

  const confidenceColor = (level: 'high' | 'medium' | 'low') => {
    if (level === 'high') return 'text-teal-700';
    if (level === 'medium') return 'text-amber-700';
    return 'text-red-700';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Scan & Review Receipts</h1>
        <p className="mt-1 text-sm text-slate-600">
          Snap a till slip or upload receipt images/PDFs. TownshipBiz extracts fields for your review and
          never saves uncertain numbers without your confirmation.
        </p>
      </div>

      {error && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button
            type="button"
            onClick={addManualReceiptReview}
            className="self-start sm:self-auto shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 cursor-pointer"
          >
            Enter Manually Instead
          </button>
        </div>
      )}

      {confirmedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" />
          <span>
            {confirmedCount} receipt(s) securely stored in your Document Vault and linked to your ZAR
            finances.
          </span>
        </div>
      )}

      {/* Upload / Camera Zone */}
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <p className="text-base font-semibold text-slate-900">
            Capture or upload one or multiple receipts
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Supports JPG, PNG, WEBP, HEIC, and PDF up to 20MB per file · VAT is only recorded if explicitly printed
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <label className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer">
              <Camera className="h-4 w-4" />
              <span>Take Receipt Photo</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>

            <label className="inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 cursor-pointer">
              <FileUp className="h-4 w-4" />
              <span>Upload Images or PDFs</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>

            <button
              type="button"
              onClick={addManualReceiptReview}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <span>Enter Receipt Manually</span>
            </button>
          </div>

          {scanning && (
            <div className="mt-5 flex items-center gap-2 text-sm font-medium text-teal-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Extracting merchant, line items, and checking for duplicate receipts...</span>
            </div>
          )}
        </div>
      </div>

      {/* Review Queue */}
      {queue.map((item, idx) => (
        <div key={item.docRecord?.id || `manual_${idx}`} className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div>
              <p className="text-xs text-slate-500">
                Receipt review required · File: {item.fileName} · Overall OCR confidence:{' '}
                <strong className={confidenceColor(item.extraction.confidence.overall)}>
                  {item.extraction.confidence.overall}
                </strong>
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                Confirm Extracted Receipt Details
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setQueue((prev) => prev.filter((_, i) => i !== idx))}
              className="text-xs font-medium text-slate-500 hover:text-red-700 cursor-pointer self-start"
            >
              Discard
            </button>
          </div>

          {item.extraction.duplicateCandidates.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                <span>Possible Duplicate Receipt Detected</span>
              </div>
              {item.extraction.duplicateCandidates.map((dup) => (
                <p key={dup.transactionId} className="text-xs">
                  Matches {dup.date} · {dup.merchantOrParty} · {formatZAR(dup.amount)} — {dup.reason}
                </p>
              ))}
            </div>
          )}

          {item.extraction.warnings.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
              {item.extraction.warnings.map((w, wIdx) => (
                <p key={wIdx}>• {w}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="flex justify-between text-xs font-medium text-slate-700">
                <span>Merchant / Supplier</span>
                <span className={confidenceColor(item.extraction.confidence.merchant)}>
                  {item.extraction.confidence.merchant} confidence
                </span>
              </label>
              <input
                type="text"
                value={item.merchant}
                onChange={(e) => updateItem(idx, { merchant: e.target.value })}
                placeholder="Enter supplier name"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </div>

            <div>
              <label className="flex justify-between text-xs font-medium text-slate-700">
                <span>Transaction Date</span>
                <span className={confidenceColor(item.extraction.confidence.date)}>
                  {item.extraction.confidence.date} confidence
                </span>
              </label>
              <input
                type="date"
                value={item.date}
                onChange={(e) => updateItem(idx, { date: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm font-mono"
              />
            </div>

            <div>
              <label className="flex justify-between text-xs font-medium text-slate-700">
                <span>Total Amount (ZAR)</span>
                <span className={confidenceColor(item.extraction.confidence.total)}>
                  {item.extraction.confidence.total} confidence
                </span>
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={item.total}
                onChange={(e) => updateItem(idx, { total: e.target.value })}
                placeholder="0.00"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="flex justify-between text-xs font-medium text-slate-700">
                <span>VAT Amount (only if shown)</span>
                <span className={confidenceColor(item.extraction.confidence.vatAmount)}>
                  {item.extraction.confidence.vatAmount}
                </span>
              </label>
              <input
                type="number"
                step="0.01"
                value={item.vatAmount}
                onChange={(e) => updateItem(idx, { vatAmount: e.target.value })}
                placeholder="None detected"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Suggested Category</label>
              <select
                value={item.category}
                onChange={(e) => updateItem(idx, { category: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                {DEFAULT_EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Payment Method</label>
              <input
                type="text"
                value={item.paymentMethod}
                onChange={(e) => updateItem(idx, { paymentMethod: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-slate-700">Description / Items</label>
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </div>
          </div>

          {item.extraction.lineItems.length > 0 && (
            <div className="overflow-x-auto border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-700 mb-2">Extracted Line Items</p>
              <table className="min-w-full text-xs">
                <thead className="text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="py-1.5 text-left">Item</th>
                    <th className="py-1.5 text-right">Qty</th>
                    <th className="py-1.5 text-right">Unit Price</th>
                    <th className="py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {item.extraction.lineItems.map((li, lIdx) => (
                    <tr key={lIdx}>
                      <td className="py-1.5 text-slate-800">{li.description}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{li.quantity ?? '-'}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {li.unitPrice !== null ? formatZAR(li.unitPrice) : '-'}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {li.lineTotal !== null ? formatZAR(li.lineTotal) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={savingIdx === idx}
              onClick={() => handleConfirmAndSave(idx)}
              className="min-h-[44px] rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer disabled:opacity-60"
            >
              {savingIdx === idx ? 'Saving...' : 'Confirm & Save Expense'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
