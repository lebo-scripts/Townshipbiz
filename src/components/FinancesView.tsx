import React, { useMemo, useState } from 'react';
import { Download, Edit3, Filter, Plus, Printer, Search, Trash2 } from 'lucide-react';
import type {
  BusinessProfile,
  ContactRecord,
  FinancialSummary,
  FinancialTransaction,
  TransactionStatus,
  TransactionType,
} from '../../shared/types';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  formatZAR,
} from '../../shared/types';
import { exportTransactionsCsvApi } from '../lib/api';
import {
  clearAllBusinessTransactions,
  createCustomCategory,
  removeTransaction,
  saveTransaction,
} from '../lib/db';

interface FinancesViewProps {
  business: BusinessProfile;
  uid: string;
  transactions: FinancialTransaction[];
  customCategories: Array<{ id: string; name: string }>;
  contacts: ContactRecord[];
  summary: FinancialSummary;
  onDownloadReceipt: (docId: string) => void;
}

const PAYMENT_METHODS = ['Cash', 'EFT', 'Card / Speedpoint', 'SnapScan / Zapper', 'Mobile Money'];

export function FinancesView({
  business,
  uid,
  transactions,
  customCategories,
  contacts,
  summary,
  onDownloadReceipt,
}: FinancesViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [txStatus, setTxStatus] = useState<TransactionStatus>('paid');
  const [amount, setAmount] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [category, setCategory] = useState<string>(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [merchantOrParty, setMerchantOrParty] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [newCustomCat, setNewCustomCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TransactionStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  const allExpenseCategories = useMemo(
    () => [...DEFAULT_EXPENSE_CATEGORIES, ...customCategories.map((c) => c.name)],
    [customCategories]
  );

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((t) => {
        if (typeFilter !== 'all' && t.type !== typeFilter) return false;
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
        if (startDate && t.date < startDate) return false;
        if (endDate && t.date > endDate) return false;
        if (selectedSupplier && (t.merchantOrParty || '').toLowerCase() !== selectedSupplier.toLowerCase()) {
          return false;
        }
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const hay = `${t.description} ${t.merchantOrParty || ''} ${t.category} ${t.paymentMethod || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, typeFilter, statusFilter, categoryFilter, startDate, endDate, searchTerm, selectedSupplier]);

  const openNewForm = (presetType: TransactionType = 'expense') => {
    setEditingId(undefined);
    setTxType(presetType);
    setTxStatus(presetType === 'receivable' || presetType === 'payable' ? 'pending' : 'paid');
    setAmount('');
    setVatAmount('');
    setCategory(
      presetType === 'income' || presetType === 'receivable'
        ? DEFAULT_INCOME_CATEGORIES[0]
        : allExpenseCategories[0]
    );
    setDescription('');
    setMerchantOrParty('');
    setPaymentMethod('Cash');
    setDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setError(null);
    setShowForm(true);
  };

  const openEditForm = (tx: FinancialTransaction) => {
    setEditingId(tx.id);
    setTxType(tx.type);
    setTxStatus(tx.status);
    setAmount(String(tx.amount));
    setVatAmount(typeof tx.vatAmount === 'number' ? String(tx.vatAmount) : '');
    setCategory(tx.category);
    setDescription(tx.description);
    setMerchantOrParty(tx.merchantOrParty || '');
    setPaymentMethod(tx.paymentMethod || 'Cash');
    setDate(tx.date);
    setDueDate(tx.dueDate || '');
    setError(null);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a valid amount greater than R0.00.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveTransaction(
        business.id,
        uid,
        {
          type: txType,
          status: txStatus,
          amount: numericAmount,
          ...(vatAmount ? { vatAmount: Number(vatAmount) || 0 } : {}),
          currency: 'ZAR',
          category,
          description: description.trim() || `${txType} entry`,
          merchantOrParty: merchantOrParty.trim(),
          paymentMethod,
          date,
          ...(dueDate ? { dueDate } : {}),
        },
        editingId
      );
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (tx: FinancialTransaction) => {
    const nextType: TransactionType =
      tx.type === 'receivable' ? 'income' : tx.type === 'payable' ? 'expense' : tx.type;
    await saveTransaction(
      business.id,
      uid,
      {
        ...tx,
        type: nextType,
        status: 'paid',
      },
      tx.id
    );
  };

  const handleAddCategory = async () => {
    if (!newCustomCat.trim()) return;
    await createCustomCategory(business.id, uid, newCustomCat.trim());
    setCategory(newCustomCat.trim());
    setNewCustomCat('');
  };

  const handleCsvExport = async () => {
    try {
      await exportTransactionsCsvApi(filteredTransactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed.');
    }
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    setError(null);
    try {
      await clearAllBusinessTransactions(business.id, uid);
      setConfirmClearAll(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear transactions.');
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Finances & ZAR Ledger</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track income, expenses, unpaid customer invoices, supplier payables, and category trends.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openNewForm('income')}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Record Income</span>
          </button>
          <button
            type="button"
            onClick={() => openNewForm('expense')}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Record Expense</span>
          </button>
          <button
            type="button"
            onClick={handleCsvExport}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            <span>Print Summary</span>
          </button>
          {transactions.length > 0 && !confirmClearAll && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {confirmClearAll && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <span>
            Delete all {transactions.length} recorded transactions for {business.name}? This cannot be undone.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={clearingAll}
              onClick={() => setConfirmClearAll(false)}
              className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={clearingAll}
              onClick={handleClearAll}
              className="min-h-[38px] rounded-lg bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800 cursor-pointer disabled:opacity-60"
            >
              {clearingAll ? 'Deleting...' : 'Confirm Clear All'}
            </button>
          </div>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Income (Paid)</p>
          <p className="mt-1 font-mono text-lg font-bold text-teal-700 tabular-nums">
            {formatZAR(summary.totalIncome)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Expenses (Paid)</p>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
            {formatZAR(summary.totalExpenses)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Net Cash Movement</p>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
            {formatZAR(summary.netCashMovement)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Customer Owed</p>
          <p className="mt-1 font-mono text-lg font-bold text-amber-700 tabular-nums">
            {formatZAR(summary.outstandingReceivables)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Supplier Payable</p>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
            {formatZAR(summary.outstandingPayables)}
          </p>
        </div>
      </div>

      {/* Add / Edit Transaction Modal-style Inline Panel */}
      {showForm && (
        <form onSubmit={handleSave} className="rounded-xl border border-slate-300 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              {editingId ? 'Edit Financial Entry' : 'New Financial Entry (ZAR)'}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Close
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Transaction Type</label>
              <select
                value={txType}
                onChange={(e) => {
                  const next = e.target.value as TransactionType;
                  setTxType(next);
                  if (next === 'income' || next === 'receivable') {
                    setCategory(DEFAULT_INCOME_CATEGORIES[0]);
                  } else {
                    setCategory(allExpenseCategories[0]);
                  }
                }}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="income">Income (Money Received)</option>
                <option value="expense">Expense (Money Paid Out)</option>
                <option value="receivable">Customer Receivable (Unpaid)</option>
                <option value="payable">Supplier Payable (Owed)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Status</label>
              <select
                value={txStatus}
                onChange={(e) => setTxStatus(e.target.value as TransactionStatus)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Amount (ZAR)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {(txType === 'income' || txType === 'receivable'
                  ? DEFAULT_INCOME_CATEGORIES
                  : allExpenseCategories
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Supplier / Customer</label>
              <input
                type="text"
                list="contacts-datalist"
                value={merchantOrParty}
                onChange={(e) => setMerchantOrParty(e.target.value)}
                placeholder="e.g. Makro / Walk-in customer"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <datalist id="contacts-datalist">
                {contacts.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Transaction Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Due Date (if unpaid)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                VAT Included (only if VAT invoice)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={vatAmount}
                onChange={(e) => setVatAmount(e.target.value)}
                placeholder="Optional"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Description</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Stock replenishment, electricity prepaid, client order"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Add Custom Category</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value={newCustomCat}
                  onChange={(e) => setNewCustomCat(e.target.value)}
                  placeholder="e.g. Packaging"
                  className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer"
            >
              {saving ? 'Saving...' : editingId ? 'Update Entry' : 'Save Entry'}
            </button>
          </div>
        </form>
      )}

      {/* Search & Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search description, supplier, customer, or payment method..."
              className="min-h-[44px] w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | TransactionType)}
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="all">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="receivable">Receivable</option>
              <option value="payable">Payable</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | TransactionStatus)}
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="all">All categories</option>
              {[...DEFAULT_INCOME_CATEGORIES, ...allExpenseCategories].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Start date"
              className="min-h-[44px] rounded-lg border border-slate-300 px-2.5 text-sm font-mono"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="End date"
              className="min-h-[44px] rounded-lg border border-slate-300 px-2.5 text-sm font-mono"
            />
          </div>
        </div>
        {selectedSupplier && (
          <div className="flex items-center justify-between text-xs text-teal-800 bg-teal-50 px-3 py-2 rounded-lg">
            <span>
              <Filter className="inline h-3.5 w-3.5 mr-1" />
              Filtered by party: <strong>{selectedSupplier}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSelectedSupplier(null)}
              className="font-semibold underline cursor-pointer"
            >
              Clear party filter
            </button>
          </div>
        )}
      </div>

      {/* Transactions Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Party / Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status & Method</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No matching financial records found.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
                    {tx.date}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{tx.merchantOrParty || tx.description}</div>
                    {tx.merchantOrParty && (
                      <div className="text-xs text-slate-500">{tx.description}</div>
                    )}
                    {tx.receiptDocumentId && (
                      <button
                        type="button"
                        onClick={() => onDownloadReceipt(tx.receiptDocumentId!)}
                        className="mt-0.5 text-xs font-medium text-teal-700 hover:underline cursor-pointer"
                      >
                        Download linked receipt
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">{tx.category}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <span
                      className={
                        tx.status === 'overdue'
                          ? 'font-semibold text-red-700'
                          : tx.status === 'pending'
                          ? 'font-semibold text-amber-700'
                          : 'text-slate-700'
                      }
                    >
                      {tx.type} · {tx.status}
                    </span>
                    <span className="text-slate-400"> · {tx.paymentMethod || 'Cash'}</span>
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono font-semibold whitespace-nowrap tabular-nums ${
                      tx.type === 'income' || tx.type === 'receivable'
                        ? 'text-teal-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {tx.type === 'income' || tx.type === 'receivable' ? '+' : '-'}
                    {formatZAR(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      {tx.status !== 'paid' && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(tx)}
                          className="min-h-[36px] rounded px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 cursor-pointer"
                        >
                          Mark Paid
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditForm(tx)}
                        aria-label="Edit transaction"
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTransaction(business.id, uid, tx.id)}
                        aria-label="Delete transaction"
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Category & Supplier Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Spending by Category</h2>
          {summary.categoryBreakdown.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No paid expenses recorded yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {summary.categoryBreakdown.map((cat) => (
                <div key={cat.category} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-800">{cat.category}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {formatZAR(cat.total)} ({cat.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-teal-700"
                      style={{ width: `${Math.min(100, cat.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Major Suppliers (Click to Filter History)</h2>
          {summary.topSuppliers.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No supplier expenses recorded yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {summary.topSuppliers.map((sup) => (
                <button
                  key={sup.supplier}
                  type="button"
                  onClick={() => setSelectedSupplier(sup.supplier)}
                  className="flex min-h-[44px] w-full items-center justify-between py-2.5 text-left hover:bg-slate-50 px-2 rounded cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{sup.supplier}</p>
                    <p className="text-xs text-slate-500">{sup.count} transaction(s)</p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {formatZAR(sup.total)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
