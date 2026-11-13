import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  FilePlus2,
  PlusCircle,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type {
  BusinessProfile,
  ComplianceAssessmentItem,
  FinancialSummary,
  FinancialTransaction,
  VaultDocument,
} from '../../shared/types';
import { formatZAR } from '../../shared/types';

interface DashboardViewProps {
  business: BusinessProfile;
  summary: FinancialSummary;
  transactions: FinancialTransaction[];
  documents: VaultDocument[];
  compliance: ComplianceAssessmentItem[];
  onNavigate: (tab: string) => void;
}

export function DashboardView({
  business,
  summary,
  transactions,
  documents,
  compliance,
  onNavigate,
}: DashboardViewProps) {
  const recentTx = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const upcomingPayments = transactions
    .filter((t) => t.status !== 'paid')
    .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date))
    .slice(0, 5);

  const todayStr = new Date().toISOString().slice(0, 10);
  const sixtyDaysOut = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const expiringDocs = documents
    .filter((d) => d.expiryDate && d.expiryDate >= todayStr && d.expiryDate <= sixtyDaysOut)
    .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));

  const applicableCompliance = compliance.filter((c) => c.classification !== 'not_applicable');
  const completedCompliance = applicableCompliance.filter((c) => c.savedStatus === 'completed').length;
  const compliancePct =
    applicableCompliance.length > 0
      ? Math.round((completedCompliance / applicableCompliance.length) * 100)
      : 0;

  const maxMonthlyVal = Math.max(
    1,
    ...summary.monthlyComparison.flatMap((m) => [m.income, m.expenses])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-slate-500">
            {business.industry} · {business.location}, {business.province}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{business.name} Overview</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('scan')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Camera className="h-4 w-4" />
            <span>Scan Receipt</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FilePlus2 className="h-4 w-4" />
            <span>Upload Document</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('finances')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Record Entry</span>
          </button>
        </div>
      </div>

      {/* 4-column ZAR KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Paid Income</p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatZAR(summary.totalIncome)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Recorded cash & EFT sales</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Paid Expenditure</p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatZAR(summary.totalExpenses)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.categoryBreakdown[0]
              ? `Top: ${summary.categoryBreakdown[0].category}`
              : 'No expenses logged yet'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Net Cash Movement</p>
          <p
            className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
              summary.netCashMovement >= 0 ? 'text-teal-700' : 'text-red-700'
            }`}
          >
            {formatZAR(summary.netCashMovement)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.netCashMovement >= 0 ? 'Positive cash surplus' : 'Expenses exceed income'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Unpaid Invoices / Payables</p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatZAR(summary.outstandingReceivables)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Owes suppliers: {formatZAR(summary.outstandingPayables)}
          </p>
        </div>
      </div>

      {/* Main 2-column workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-6">
          {/* Cash-flow overview */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Monthly Cash-Flow Overview</h2>
                <p className="text-xs text-slate-500">Paid income vs paid expenses by month (ZAR)</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('finances')}
                className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open Ledger</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {summary.monthlyComparison.length === 0 ? (
              <div className="mt-6 py-8 text-center text-sm text-slate-500">
                Record your first income or expense, or scan a receipt to see monthly cash trends.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {summary.monthlyComparison.slice(-6).map((m) => (
                  <div key={m.month} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-medium text-slate-700">{m.month}</span>
                      <span className="font-mono text-slate-600 tabular-nums">
                        In {formatZAR(m.income)} · Out {formatZAR(m.expenses)} · Net {formatZAR(m.net)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-teal-600"
                          style={{ width: `${Math.min(100, (m.income / maxMonthlyVal) * 100)}%` }}
                        />
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-slate-400"
                          style={{ width: `${Math.min(100, (m.expenses / maxMonthlyVal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {summary.accountingCaveat}
            </p>
          </section>

          {/* Recent Transactions */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Recent Transactions</h2>
              <button
                type="button"
                onClick={() => onNavigate('finances')}
                className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
              >
                View all ({transactions.length})
              </button>
            </div>

            {recentTx.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No transactions yet. Use Scan Receipt or Record Entry above to log your first Rand.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {tx.merchantOrParty || tx.description}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {tx.date} · {tx.category} · {tx.paymentMethod || 'Cash'} · {tx.status}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
                        tx.type === 'income' || tx.type === 'receivable'
                          ? 'text-teal-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {tx.type === 'income' || tx.type === 'receivable' ? '+' : '-'}
                      {formatZAR(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Insights, Compliance, Expiring Docs, Upcoming Payments */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-teal-700" />
                <h2 className="text-base font-semibold text-slate-900">Financial Insights</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('adviser')}
                className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
              >
                Ask AI Adviser
              </button>
            </div>
            {summary.insights.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No unusual spending patterns or overdue alerts detected across your current records.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {summary.insights.slice(0, 3).map((ins) => (
                  <div key={ins.id} className="py-3 first:pt-1 last:pb-0">
                    <p
                      className={`text-xs font-semibold ${
                        ins.severity === 'critical'
                          ? 'text-red-700'
                          : ins.severity === 'warning'
                          ? 'text-amber-700'
                          : 'text-teal-800'
                      }`}
                    >
                      {ins.severity.toUpperCase()} · {ins.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{ins.whatDetected}</p>
                    <p className="mt-1 text-xs text-slate-500">{ins.suggestedAction}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-700" />
                <h2 className="text-base font-semibold text-slate-900">SA Compliance Progress</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('compliance')}
                className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
              >
                Checklist
              </button>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-slate-600">
                  {completedCompliance} of {applicableCompliance.length} applicable rules completed
                </span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">{compliancePct}%</span>
              </div>
              <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-teal-700" style={{ width: `${compliancePct}%` }} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Document Expiry & Upcoming Due</h2>
              <button
                type="button"
                onClick={() => onNavigate('documents')}
                className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
              >
                Vault ({documents.length})
              </button>
            </div>

            {expiringDocs.length === 0 && upcomingPayments.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No documents expiring within 60 days and no pending unpaid items.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                {expiringDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{doc.name}</p>
                        <p className="text-xs text-slate-500">{doc.category} · Expires {doc.expiryDate}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {upcomingPayments.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {tx.merchantOrParty || tx.description}
                      </p>
                      <p className="text-xs text-slate-500">
                        {tx.type} · {tx.status} · Due {tx.dueDate || tx.date}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatZAR(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
