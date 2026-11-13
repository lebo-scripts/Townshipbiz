import React, { useState } from 'react';
import { Package, Plus, Printer, Trash2, Users } from 'lucide-react';
import type {
  BusinessProfile,
  ContactRecord,
  FinancialTransaction,
  InventoryItem,
  InvoiceLineItem,
  InvoiceRecord,
} from '../../shared/types';
import { formatZAR } from '../../shared/types';
import {
  deleteContact,
  deleteInventoryItem,
  markInvoicePaid,
  saveContact,
  saveInventoryItem,
  saveInvoice,
} from '../lib/db';

interface BusinessToolsViewProps {
  business: BusinessProfile;
  uid: string;
  invoices: InvoiceRecord[];
  contacts: ContactRecord[];
  inventory: InventoryItem[];
  transactions: FinancialTransaction[];
}

export function BusinessToolsView({
  business,
  uid,
  invoices,
  contacts,
  inventory,
  transactions,
}: BusinessToolsViewProps) {
  const [subTab, setSubTab] = useState<'invoices' | 'contacts' | 'stock'>('invoices');

  // Invoice form state
  const [docType, setDocType] = useState<'invoice' | 'quotation'>('invoice');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [itemDesc, setItemDesc] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemPrice, setItemPrice] = useState('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [includeVat, setIncludeVat] = useState(business.vatRegistered);
  const [savingInv, setSavingInv] = useState(false);

  // Contact form state
  const [contactType, setContactType] = useState<'customer' | 'supplier'>('supplier');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactAddress, setContactAddress] = useState('');
  const [selectedContactName, setSelectedContactName] = useState<string | null>(null);

  // Stock form state
  const [stockName, setStockName] = useState('');
  const [stockUnit, setStockUnit] = useState('units');
  const [stockQty, setStockQty] = useState('10');
  const [stockReorder, setStockReorder] = useState('5');
  const [stockCost, setStockCost] = useState('');
  const [stockSell, setStockSell] = useState('');

  const addLineItem = () => {
    const qty = Number(itemQty) || 1;
    const price = Number(itemPrice) || 0;
    if (!itemDesc.trim() || price <= 0) return;
    setLineItems((prev) => [...prev, { description: itemDesc.trim(), quantity: qty, unitPrice: price }]);
    setItemDesc('');
    setItemQty('1');
    setItemPrice('');
  };

  const subtotal = lineItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const vatAmount = includeVat ? Math.round(subtotal * 0.15 * 100) / 100 : 0;
  const total = subtotal + vatAmount;

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || lineItems.length === 0) return;
    setSavingInv(true);
    try {
      const prefix = docType === 'invoice' ? 'INV' : 'QUO';
      const num = `${prefix}-${String(invoices.length + 101)}`;
      await saveInvoice(business.id, uid, {
        docType,
        number: num,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate,
        items: lineItems,
        subtotal,
        vatAmount,
        total,
        status: 'sent',
      });
      setCustomerName('');
      setCustomerEmail('');
      setLineItems([]);
    } finally {
      setSavingInv(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim()) return;
    await saveContact(business.id, uid, {
      type: contactType,
      name: contactName.trim(),
      phone: contactPhone.trim(),
      address: contactAddress.trim(),
    });
    setContactName('');
    setContactPhone('');
    setContactAddress('');
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockName.trim()) return;
    await saveInventoryItem(business.id, uid, {
      sku: `SKU-${inventory.length + 101}`,
      name: stockName.trim(),
      unit: stockUnit.trim() || 'units',
      quantity: Math.max(0, Number(stockQty) || 0),
      reorderLevel: Math.max(0, Number(stockReorder) || 0),
      costPrice: Math.max(0, Number(stockCost) || 0),
      sellingPrice: Math.max(0, Number(stockSell) || 0),
    });
    setStockName('');
    setStockCost('');
    setStockSell('');
  };

  const contactTransactions = selectedContactName
    ? transactions.filter(
        (t) => (t.merchantOrParty || '').toLowerCase() === selectedContactName.toLowerCase()
      )
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Business Administration Tools</h1>
          <p className="mt-1 text-sm text-slate-600">
            Generate ZAR invoices & quotations, manage customers and suppliers, and monitor stock levels.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer self-start"
        >
          <Printer className="h-4 w-4" />
          <span>Print / Save PDF</span>
        </button>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {(
          [
            ['invoices', 'Invoices & Quotations'],
            ['contacts', 'Customers & Suppliers'],
            ['stock', 'Stock Management'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`min-h-[40px] rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'invoices' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleCreateInvoice}
            className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <h2 className="text-base font-bold text-slate-900">Create Invoice or Quotation</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Document Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as 'invoice' | 'quotation')}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="invoice">Invoice</option>
                  <option value="quotation">Quotation</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Customer Name</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Klipspruit Primary School"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Customer Email (optional)</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-700">Add Line Items</p>
              <div className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  placeholder="Item / service"
                  className="col-span-6 min-h-[40px] rounded-lg border border-slate-300 px-2.5 text-xs"
                />
                <input
                  type="number"
                  min="1"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                  placeholder="Qty"
                  className="col-span-2 min-h-[40px] rounded-lg border border-slate-300 px-2 text-xs font-mono"
                />
                <input
                  type="number"
                  step="0.01"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  placeholder="R Price"
                  className="col-span-4 min-h-[40px] rounded-lg border border-slate-300 px-2.5 text-xs font-mono"
                />
              </div>
              <button
                type="button"
                onClick={addLineItem}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Line Item</span>
              </button>
            </div>

            {lineItems.length > 0 && (
              <div className="border-t border-slate-100 pt-3 text-xs space-y-1">
                {lineItems.map((li, i) => (
                  <div key={i} className="flex justify-between">
                    <span>
                      {li.description} ({li.quantity} × {formatZAR(li.unitPrice)})
                    </span>
                    <span className="font-mono font-semibold">{formatZAR(li.quantity * li.unitPrice)}</span>
                  </div>
                ))}
                <div className="border-t border-slate-100 pt-2 flex justify-between font-bold text-sm">
                  <span>Total {includeVat ? '(incl. 15% VAT)' : '(No VAT)'}</span>
                  <span className="font-mono">{formatZAR(total)}</span>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVat}
                onChange={(e) => setIncludeVat(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-700"
              />
              <span>Charge 15% VAT (only if SARS VAT registered)</span>
            </label>

            <button
              type="submit"
              disabled={savingInv || lineItems.length === 0}
              className="min-h-[44px] w-full rounded-lg bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer disabled:opacity-50"
            >
              {savingInv ? 'Generating...' : `Generate ${docType === 'invoice' ? 'Invoice' : 'Quotation'}`}
            </button>
          </form>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            <div className="p-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Issued Invoices & Quotations</h2>
              <span className="text-xs text-slate-500">{invoices.length} document(s)</span>
            </div>
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No invoices or quotations yet. When you mark an invoice paid, TownshipBiz automatically
                creates a single linked income record without duplicating entries.
              </div>
            ) : (
              invoices.map((inv) => (
                <div key={inv.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {inv.number} · {inv.customerName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {inv.docType} · Issued {inv.issueDate}
                      {inv.dueDate ? ` · Due ${inv.dueDate}` : ''} ·{' '}
                      <strong className={inv.status === 'paid' ? 'text-teal-700' : 'text-amber-700'}>
                        {inv.status}
                      </strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {formatZAR(inv.total)}
                    </span>
                    {inv.docType === 'invoice' && inv.status !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => markInvoicePaid(business.id, uid, inv)}
                        className="min-h-[38px] rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
                      >
                        Mark Paid
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {subTab === 'contacts' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleAddContact}
            className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-3 h-fit"
          >
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-700" />
              <span>Add Customer or Supplier</span>
            </h2>
            <select
              value={contactType}
              onChange={(e) => setContactType(e.target.value as 'customer' | 'supplier')}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="supplier">Supplier</option>
              <option value="customer">Customer</option>
            </select>
            <input
              type="text"
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Name / Business name"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Phone number"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              type="text"
              value={contactAddress}
              onChange={(e) => setContactAddress(e.target.value)}
              placeholder="Address / Area"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
            <button
              type="submit"
              className="min-h-[44px] w-full rounded-lg bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer"
            >
              Save Contact
            </button>
          </form>

          <div className="lg:col-span-8 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {contacts.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">
                  No customers or suppliers saved yet.
                </p>
              ) : (
                contacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-4 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedContactName(c.name)}
                      className="text-left flex-1 cursor-pointer"
                    >
                      <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.type} · {c.phone || 'No phone'} · {c.address || 'No address'}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteContact(business.id, c.id)}
                      aria-label="Delete contact"
                      className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded text-slate-400 hover:text-red-700 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {selectedContactName && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-bold text-slate-900">
                  Payment & Transaction History: {selectedContactName}
                </h3>
                {contactTransactions.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No financial transactions linked to {selectedContactName} yet.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100 text-xs">
                    {contactTransactions.map((tx) => (
                      <div key={tx.id} className="flex justify-between py-2">
                        <span>
                          {tx.date} · {tx.description} ({tx.status})
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatZAR(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'stock' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleAddStock}
            className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-3 h-fit"
          >
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Package className="h-4 w-4 text-teal-700" />
              <span>Add Stock Item</span>
            </h2>
            <input
              type="text"
              required
              value={stockName}
              onChange={(e) => setStockName(e.target.value)}
              placeholder="Product name (e.g. Cooking Oil 2L)"
              className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                placeholder="Qty"
                className="min-h-[44px] rounded-lg border border-slate-300 px-2.5 text-sm font-mono"
              />
              <input
                type="text"
                value={stockUnit}
                onChange={(e) => setStockUnit(e.target.value)}
                placeholder="Unit"
                className="min-h-[44px] rounded-lg border border-slate-300 px-2.5 text-sm"
              />
              <input
                type="number"
                value={stockReorder}
                onChange={(e) => setStockReorder(e.target.value)}
                placeholder="Min"
                className="min-h-[44px] rounded-lg border border-slate-300 px-2.5 text-sm font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.01"
                value={stockCost}
                onChange={(e) => setStockCost(e.target.value)}
                placeholder="Cost (ZAR)"
                className="min-h-[44px] rounded-lg border border-slate-300 px-2.5 text-sm font-mono"
              />
              <input
                type="number"
                step="0.01"
                required
                value={stockSell}
                onChange={(e) => setStockSell(e.target.value)}
                placeholder="Sell price (ZAR)"
                className="min-h-[44px] rounded-lg border border-slate-300 px-2.5 text-sm font-mono"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] w-full rounded-lg bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer"
            >
              Add Stock Item
            </button>
          </form>

          <div className="lg:col-span-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">In Stock</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">Selling Price</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No stock items tracked yet.
                    </td>
                  </tr>
                ) : (
                  inventory.map((item) => {
                    const lowStock = item.quantity <= item.reorderLevel;
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-500">
                            {item.sku}
                            {lowStock && (
                              <span className="ml-2 font-semibold text-amber-700">
                                Low stock (reorder &le; {item.reorderLevel})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {formatZAR(item.costPrice)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                          {formatZAR(item.sellingPrice)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                saveInventoryItem(
                                  business.id,
                                  uid,
                                  { ...item, quantity: Math.max(0, item.quantity - 1) },
                                  item.id
                                )
                              }
                              className="min-h-[32px] min-w-[32px] rounded border border-slate-200 text-xs font-bold cursor-pointer"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                saveInventoryItem(
                                  business.id,
                                  uid,
                                  { ...item, quantity: item.quantity + 1 },
                                  item.id
                                )
                              }
                              className="min-h-[32px] min-w-[32px] rounded border border-slate-200 text-xs font-bold cursor-pointer"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteInventoryItem(business.id, item.id)}
                              className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center text-slate-400 hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
