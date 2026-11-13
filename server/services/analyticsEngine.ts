import type { FinancialInsight, FinancialSummary, FinancialTransaction } from '../../shared/types.ts';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeFinancialAnalytics(
  transactions: FinancialTransaction[],
  options: { startDate?: string; endDate?: string } = {}
): FinancialSummary {
  const filtered = transactions.filter((tx) => {
    if (options.startDate && tx.date < options.startDate) return false;
    if (options.endDate && tx.date > options.endDate) return false;
    return true;
  });

  let totalIncome = 0;
  let totalExpenses = 0;
  let outstandingReceivables = 0;
  let outstandingPayables = 0;
  let paidTransactionsCount = 0;
  let pendingTransactionsCount = 0;
  let overdueCount = 0;

  const monthlyMap = new Map<string, { income: number; expenses: number }>();
  const categoryMap = new Map<string, { total: number; count: number }>();
  const supplierMap = new Map<string, { total: number; count: number }>();
  const recurringMap = new Map<string, { merchant: string; description: string; amounts: number[] }>();

  for (const tx of filtered) {
    const amount = Number(tx.amount) || 0;
    const monthKey = (tx.date || '').slice(0, 7) || 'Unknown';
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, { income: 0, expenses: 0 });
    }
    const m = monthlyMap.get(monthKey)!;

    if (tx.status === 'paid') paidTransactionsCount++;
    if (tx.status === 'pending') pendingTransactionsCount++;
    if (tx.status === 'overdue') overdueCount++;

    if (tx.type === 'income' && tx.status === 'paid') {
      totalIncome += amount;
      m.income += amount;
    } else if (tx.type === 'expense' && tx.status === 'paid') {
      totalExpenses += amount;
      m.expenses += amount;

      const cat = tx.category || 'Other expenses';
      const cEntry = categoryMap.get(cat) || { total: 0, count: 0 };
      cEntry.total += amount;
      cEntry.count += 1;
      categoryMap.set(cat, cEntry);

      if (tx.merchantOrParty) {
        const sKey = tx.merchantOrParty.trim();
        const sEntry = supplierMap.get(sKey) || { total: 0, count: 0 };
        sEntry.total += amount;
        sEntry.count += 1;
        supplierMap.set(sKey, sEntry);
      }

      const recKey = `${(tx.merchantOrParty || '').toLowerCase()}::${(tx.description || '').toLowerCase()}`;
      if (tx.description) {
        const rEntry = recurringMap.get(recKey) || {
          merchant: tx.merchantOrParty || 'Unspecified supplier',
          description: tx.description,
          amounts: [],
        };
        rEntry.amounts.push(amount);
        recurringMap.set(recKey, rEntry);
      }
    } else if (tx.type === 'receivable' && tx.status !== 'paid') {
      outstandingReceivables += amount;
    } else if (tx.type === 'payable' && tx.status !== 'paid') {
      outstandingPayables += amount;
    } else if (tx.type === 'income' && tx.status !== 'paid') {
      outstandingReceivables += amount;
    } else if (tx.type === 'expense' && tx.status !== 'paid') {
      outstandingPayables += amount;
    }
  }

  const monthlyComparison = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, val]) => ({
      month,
      income: round2(val.income),
      expenses: round2(val.expenses),
      net: round2(val.income - val.expenses),
    }));

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, val]) => ({
      category,
      total: round2(val.total),
      percentage: totalExpenses > 0 ? round2((val.total / totalExpenses) * 100) : 0,
      count: val.count,
    }))
    .sort((a, b) => b.total - a.total);

  const topSuppliers = Array.from(supplierMap.entries())
    .map(([supplier, val]) => ({
      supplier,
      total: round2(val.total),
      count: val.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const recurringExpenses = Array.from(recurringMap.values())
    .filter((entry) => entry.amounts.length >= 2)
    .map((entry) => ({
      description: entry.description,
      merchant: entry.merchant,
      averageAmount: round2(entry.amounts.reduce((a, b) => a + b, 0) / entry.amounts.length),
      occurrences: entry.amounts.length,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 5);

  const insights = detectFinancialPatterns(filtered, monthlyComparison);

  const hasInventoryOrCogs = categoryBreakdown.some((c) => c.category === 'Inventory and stock');
  const accountingCaveat = hasInventoryOrCogs
    ? 'Figures show recorded cash inflow, paid expenses, and open receivables/payables (net cash movement). Formal gross/net profit and taxable income require opening/closing stock valuations and professional tax verification.'
    : 'Figures show cash movement from recorded entries. Opening stock, depreciation, and statutory tax adjustments are not included; consult a tax practitioner for formal financial statements.';

  return {
    totalIncome: round2(totalIncome),
    totalExpenses: round2(totalExpenses),
    netCashMovement: round2(totalIncome - totalExpenses),
    outstandingReceivables: round2(outstandingReceivables),
    outstandingPayables: round2(outstandingPayables),
    paidTransactionsCount,
    pendingTransactionsCount,
    overdueCount,
    monthlyComparison,
    categoryBreakdown,
    topSuppliers,
    recurringExpenses,
    insights,
    accountingCaveat,
  };
}

export function detectFinancialPatterns(
  transactions: FinancialTransaction[],
  monthlyComparison: Array<{ month: string; income: number; expenses: number; net: number }>
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  // 1. Month-over-month category spikes (>15% increase)
  const months = monthlyComparison.map((m) => m.month).sort();
  if (months.length >= 2) {
    const prevMonth = months[months.length - 2];
    const currMonth = months[months.length - 1];

    const catPrev = new Map<string, number>();
    const catCurr = new Map<string, FinancialTransaction[]>();

    for (const tx of transactions) {
      if (tx.type !== 'expense' || tx.status !== 'paid') continue;
      const m = tx.date.slice(0, 7);
      if (m === prevMonth) {
        catPrev.set(tx.category, (catPrev.get(tx.category) || 0) + tx.amount);
      } else if (m === currMonth) {
        const list = catCurr.get(tx.category) || [];
        list.push(tx);
        catCurr.set(tx.category, list);
      }
    }

    for (const [cat, currList] of catCurr.entries()) {
      const prevVal = catPrev.get(cat) || 0;
      const currVal = currList.reduce((acc, t) => acc + t.amount, 0);
      if (prevVal > 0 && currVal > prevVal * 1.15 && currVal - prevVal >= 150) {
        const pct = Math.round(((currVal - prevVal) / prevVal) * 100);
        insights.push({
          id: `cat-spike-${cat}`,
          severity: pct >= 30 ? 'warning' : 'info',
          title: `${cat} expenses rose by ${pct}%`,
          whatDetected: `Your ${cat.toLowerCase()} expenses increased by ${pct}% in ${currMonth} (R${currVal.toFixed(2)}) compared with ${prevMonth} (R${prevVal.toFixed(2)}).`,
          supportingRecords: currList.slice(0, 4).map((t) => ({
            id: t.id,
            label: `${t.merchantOrParty || t.description}`,
            amount: t.amount,
            date: t.date,
          })),
          whyItMatters: `Unchecked increases in ${cat.toLowerCase()} can squeeze your monthly cash margin.`,
          suggestedAction: `Review recent ${cat.toLowerCase()} receipts and compare supplier or delivery alternatives.`,
        });
      }
    }

    // Falling revenue detection
    const prevM = monthlyComparison[monthlyComparison.length - 2];
    const currM = monthlyComparison[monthlyComparison.length - 1];
    if (prevM.income > 0 && currM.income < prevM.income * 0.85) {
      const dropPct = Math.round(((prevM.income - currM.income) / prevM.income) * 100);
      insights.push({
        id: `rev-drop-${currM.month}`,
        severity: 'warning',
        title: `Recorded income fell by ${dropPct}% in ${currM.month}`,
        whatDetected: `Paid income dropped from R${prevM.income.toFixed(2)} in ${prevM.month} to R${currM.income.toFixed(2)} in ${currM.month}.`,
        supportingRecords: [],
        whyItMatters: 'Lower cash inflows while fixed costs remain steady can create short-term cash shortfalls.',
        suggestedAction: 'Follow up on unpaid customer invoices and check whether all cash/EFT sales for the current month have been recorded.',
      });
    }
  }

  // 2. Unpaid / overdue customer invoices & payables
  const unpaidReceivables = transactions.filter(
    (t) => (t.type === 'receivable' || t.type === 'income') && t.status !== 'paid'
  );
  if (unpaidReceivables.length > 0) {
    const totalUnpaid = unpaidReceivables.reduce((sum, t) => sum + t.amount, 0);
    const hasOverdue = unpaidReceivables.some((t) => t.status === 'overdue');
    insights.push({
      id: 'unpaid-receivables',
      severity: hasOverdue ? 'critical' : 'warning',
      title: `${unpaidReceivables.length} unpaid customer payment(s) totalling R${totalUnpaid.toFixed(2)}`,
      whatDetected: `You have ${unpaidReceivables.length} outstanding customer receivable(s).`,
      supportingRecords: unpaidReceivables.slice(0, 4).map((t) => ({
        id: t.id,
        label: t.merchantOrParty || t.description,
        amount: t.amount,
        date: t.dueDate || t.date,
      })),
      whyItMatters: 'Delayed customer payments reduce cash on hand to restock inventory and pay suppliers.',
      suggestedAction: 'Send payment reminders to overdue customers and request deposits on large orders.',
    });
  }

  // 3. Possible duplicate expenses (same amount + same date + similar merchant)
  const seen = new Map<string, FinancialTransaction>();
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const key = `${tx.date}::${tx.amount.toFixed(2)}::${(tx.merchantOrParty || tx.description).toLowerCase().trim()}`;
    const existing = seen.get(key);
    if (existing) {
      insights.push({
        id: `dup-${tx.id}`,
        severity: 'warning',
        title: 'Possible duplicate expense entry detected',
        whatDetected: `Two expense records of R${tx.amount.toFixed(2)} on ${tx.date} for "${tx.merchantOrParty || tx.description}".`,
        supportingRecords: [
          { id: existing.id, label: existing.description, amount: existing.amount, date: existing.date },
          { id: tx.id, label: tx.description, amount: tx.amount, date: tx.date },
        ],
        whyItMatters: 'Duplicate expenses overstate your costs and distort monthly cash movement.',
        suggestedAction: 'Verify whether two separate purchases happened on the same day or remove the duplicate.',
      });
    } else {
      seen.set(key, tx);
    }
  }

  // 4. Negative net cash movement warning
  const paidIncome = transactions
    .filter((t) => t.type === 'income' && t.status === 'paid')
    .reduce((a, b) => a + b.amount, 0);
  const paidExpenses = transactions
    .filter((t) => t.type === 'expense' && t.status === 'paid')
    .reduce((a, b) => a + b.amount, 0);

  if (paidExpenses > paidIncome && transactions.length >= 2) {
    insights.push({
      id: 'negative-cashflow',
      severity: 'critical',
      title: 'Recorded expenses exceed recorded income',
      whatDetected: `Paid expenses (R${paidExpenses.toFixed(2)}) exceed paid income (R${paidIncome.toFixed(2)}) by R${(paidExpenses - paidIncome).toFixed(2)}.`,
      supportingRecords: [],
      whyItMatters: 'Sustained negative cash movement can deplete working capital.',
      suggestedAction: 'Check if any daily cash sales are missing from the ledger, and defer non-urgent purchases.',
    });
  }

  return insights.slice(0, 6);
}

export function buildTransactionsCSV(transactions: FinancialTransaction[]): string {
  const escape = (val: string | number | undefined) => {
    const str = String(val ?? '');
    // Prevent CSV formula injection (=, +, -, @)
    const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const headers = [
    'Date',
    'Type',
    'Status',
    'Category',
    'Merchant / Party',
    'Description',
    'Payment Method',
    'Amount (ZAR)',
    'VAT Amount (ZAR)',
    'Due Date',
  ];

  const rows = transactions.map((t) =>
    [
      escape(t.date),
      escape(t.type),
      escape(t.status),
      escape(t.category),
      escape(t.merchantOrParty || ''),
      escape(t.description),
      escape(t.paymentMethod || ''),
      escape(t.amount.toFixed(2)),
      escape(typeof t.vatAmount === 'number' ? t.vatAmount.toFixed(2) : ''),
      escape(t.dueDate || ''),
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
