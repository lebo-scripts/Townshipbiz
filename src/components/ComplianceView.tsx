import React, { useMemo, useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import type {
  BusinessProfile,
  ComplianceAssessmentItem,
  ComplianceClassification,
  VaultDocument,
} from '../../shared/types';
import { saveComplianceProgress } from '../lib/db';

interface ComplianceViewProps {
  business: BusinessProfile;
  uid: string;
  items: ComplianceAssessmentItem[];
  documents: VaultDocument[];
}

const CLASSIFICATION_LABELS: Record<ComplianceClassification, string> = {
  mandatory: 'Mandatory',
  conditional: 'Conditional',
  recommended: 'Recommended',
  not_applicable: 'Not Applicable',
  requires_professional_review: 'Requires Professional Review',
};

export function ComplianceView({ business, uid, items, documents }: ComplianceViewProps) {
  const [filter, setFilter] = useState<'all' | ComplianceClassification>('all');
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => i.classification === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    return {
      mandatory: items.filter((i) => i.classification === 'mandatory').length,
      conditional: items.filter((i) => i.classification === 'conditional').length,
      review: items.filter((i) => i.classification === 'requires_professional_review').length,
      exempt: items.filter((i) => i.classification === 'not_applicable').length,
    };
  }, [items]);

  const handleUpdate = async (
    item: ComplianceAssessmentItem,
    patch: {
      status?: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
      linkedDocumentId?: string;
      renewalDate?: string;
      notes?: string;
    }
  ) => {
    setSavingRuleId(item.rule.id);
    try {
      await saveComplianceProgress(business.id, uid, {
        ruleId: item.rule.id,
        status: patch.status ?? item.savedStatus,
        ...(patch.linkedDocumentId ?? item.linkedDocumentId
          ? { linkedDocumentId: patch.linkedDocumentId ?? item.linkedDocumentId }
          : {}),
        ...(patch.renewalDate ?? item.renewalDate
          ? { renewalDate: patch.renewalDate ?? item.renewalDate }
          : {}),
        ...(patch.notes ?? item.notes ? { notes: patch.notes ?? item.notes } : {}),
      });
    } finally {
      setSavingRuleId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-slate-500">
          {business.structure.replace('_', ' ')} · {business.industry} · {business.employeeCount}{' '}
          employee(s) · {business.annualTurnoverRange}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">South African Regulatory Compliance</h1>
        <p className="mt-1 text-sm text-slate-600">
          Assessed deterministically from your business structure, turnover, employee count, industry,
          and municipal area. Unverified local by-laws are flagged honestly rather than guessed.
        </p>
      </div>

      {/* Classification Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Mandatory</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {counts.mandatory}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Conditional</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {counts.conditional}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Local / Prof. Review</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">
            {counts.review}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Exempt / Not Applicable</p>
          <p className="mt-1 font-mono text-2xl font-bold text-teal-700 tabular-nums">
            {counts.exempt}
          </p>
        </div>
      </div>

      {/* Filter Segmented Bar */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {(
          [
            ['all', 'All Rules'],
            ['mandatory', 'Mandatory'],
            ['conditional', 'Conditional'],
            ['requires_professional_review', 'Requires Review'],
            ['recommended', 'Recommended'],
            ['not_applicable', 'Exempt / N/A'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setFilter(val)}
            className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              filter === val ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        {filtered.map((item) => (
          <article
            key={item.rule.id}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-3"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs text-slate-500">
                  {item.rule.area} ·{' '}
                  <span
                    className={
                      item.classification === 'mandatory'
                        ? 'font-semibold text-red-700'
                        : item.classification === 'requires_professional_review'
                        ? 'font-semibold text-amber-700'
                        : item.classification === 'not_applicable'
                        ? 'font-semibold text-teal-700'
                        : 'font-semibold text-slate-800'
                    }
                  >
                    {CLASSIFICATION_LABELS[item.classification]}
                  </span>{' '}
                  · Verified {item.rule.lastVerifiedDate}
                </p>
                <h2 className="mt-1 text-base font-bold text-slate-900">{item.rule.name}</h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  aria-label={`Status for ${item.rule.name}`}
                  disabled={savingRuleId === item.rule.id}
                  value={item.savedStatus}
                  onChange={(e) =>
                    handleUpdate(item, {
                      status: e.target.value as 'pending' | 'in_progress' | 'completed' | 'not_applicable',
                    })
                  }
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="not_applicable">Not Applicable</option>
                </select>
              </div>
            </div>

            <p className="text-sm text-slate-700">{item.reason}</p>
            <p className="text-xs text-slate-600">{item.rule.description}</p>

            {item.uncertaintyNote && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>Local / Professional Verification Note:</strong> {item.uncertaintyNote}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
              <div>
                <span className="font-semibold text-slate-700">Conditions & Thresholds:</span>{' '}
                <span className="text-slate-600">{item.rule.conditionsAndThresholds}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Verified Exemptions:</span>{' '}
                <span className="text-slate-600">{item.rule.exemptions}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <a
                  href={item.rule.officialSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{item.rule.officialSourceName}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">Effective {item.rule.effectiveDate}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Link vault document"
                  value={item.linkedDocumentId || ''}
                  onChange={(e) => handleUpdate(item, { linkedDocumentId: e.target.value })}
                  className="min-h-[38px] max-w-[200px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
                >
                  <option value="">Link proof from Vault...</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  aria-label="Renewal date"
                  value={item.renewalDate || ''}
                  onChange={(e) => handleUpdate(item, { renewalDate: e.target.value })}
                  className="min-h-[38px] rounded-lg border border-slate-300 px-2.5 text-xs font-mono"
                />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
