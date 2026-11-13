export type SAProvince =
  | 'Gauteng'
  | 'Western Cape'
  | 'KwaZulu-Natal'
  | 'Eastern Cape'
  | 'Limpopo'
  | 'Mpumalanga'
  | 'North West'
  | 'Free State'
  | 'Northern Cape';

export type BusinessStructure =
  | 'informal'
  | 'sole_proprietor'
  | 'pty_ltd'
  | 'cooperative'
  | 'npo';

export type IndustryType =
  | 'Spaza & Grocery Retail'
  | 'Food Vendor & Restaurant'
  | 'Hair Salon & Barber'
  | 'General Retail'
  | 'Freelance & Professional Services'
  | 'Trades & Maintenance'
  | 'Transport & Delivery'
  | 'Agriculture & Fresh Produce'
  | 'Clothing & Tailoring'
  | 'Technology & Startup';

export type PlanTier = 'free' | 'starter' | 'growth';

export type UserRole = 'owner' | 'manager' | 'bookkeeper' | 'viewer';

export type TransactionType = 'income' | 'expense' | 'receivable' | 'payable';
export type TransactionStatus = 'paid' | 'pending' | 'overdue';

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Inventory and stock',
  'Rent',
  'Transport',
  'Electricity and utilities',
  'Salaries and wages',
  'Marketing',
  'Equipment',
  'Repairs and maintenance',
  'Communication',
  'Professional services',
  'Bank charges',
  'Other expenses',
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  'Cash sales',
  'EFT & card sales',
  'Service fees',
  'Wholesale orders',
  'Other income',
] as const;

export const DOCUMENT_CATEGORIES = [
  'Receipts',
  'Supplier invoices',
  'Customer invoices',
  'Bank statements',
  'Tax documents',
  'Business registration certificates',
  'Trading permits',
  'Employment contracts',
  'Lease agreements',
  'Insurance policies',
  'Loan agreements',
  'Supplier contracts',
  'Customer contracts',
  'Identity and business verification documents',
  'Other business records',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export interface NotificationPreferences {
  complianceDeadlines: boolean;
  expiringDocuments: boolean;
  unpaidInvoices: boolean;
  supplierPayments: boolean;
  unusualActivity: boolean;
  reminderDaysBefore: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  planTier: PlanTier;
  popiaConsent: boolean;
  popiaConsentAt?: string;
  retentionMonths?: number;
  notificationPrefs?: NotificationPreferences;
  createdAt?: string;
  updatedAt?: string;
}

export interface BusinessProfile {
  id: string;
  ownerUid: string;
  name: string;
  industry: string;
  structure: BusinessStructure;
  registrationNumber?: string;
  vatRegistered: boolean;
  vatNumber?: string;
  location: string;
  municipality?: string;
  province: SAProvince;
  employeeCount: number;
  annualTurnoverRange: string;
  operatingHours?: string;
  phone?: string;
  email?: string;
  marketplaceListed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinancialTransaction {
  id: string;
  ownerUid: string;
  businessId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  vatAmount?: number;
  currency: 'ZAR';
  category: string;
  description: string;
  merchantOrParty?: string;
  paymentMethod?: string;
  date: string;
  dueDate?: string;
  receiptDocumentId?: string;
  receiptHash?: string;
  ocrVerified?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReceiptLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export type FieldConfidence = 'high' | 'medium' | 'low';

export interface DuplicateCandidate {
  transactionId: string;
  date: string;
  amount: number;
  merchantOrParty: string;
  reason: string;
}

export interface ReceiptExtractionResult {
  merchant: string | null;
  date: string | null;
  receiptNumber: string | null;
  lineItems: ReceiptLineItem[];
  subtotal: number | null;
  discounts: number | null;
  vatAmount: number | null;
  total: number | null;
  paymentMethod: string | null;
  suggestedCategory: string;
  rawText: string;
  confidence: {
    merchant: FieldConfidence;
    date: FieldConfidence;
    total: FieldConfidence;
    vatAmount: FieldConfidence;
    overall: FieldConfidence;
  };
  warnings: string[];
  duplicateCandidates: DuplicateCandidate[];
  usedFallback?: boolean;
}

export interface VaultDocument {
  id: string;
  ownerUid: string;
  businessId: string;
  name: string;
  category: DocumentCategory;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  sha256?: string;
  extractedText?: string;
  aiSummary?: string;
  keyDates?: string[];
  amounts?: string[];
  paymentObligations?: string[];
  importantClauses?: string[];
  missingInfo?: string[];
  issueDate?: string;
  expiryDate?: string;
  issuingAuthority?: string;
  linkedTransactionId?: string;
  linkedComplianceId?: string;
  legalDisclaimer?: string;
  createdAt?: string;
}

export interface DocumentInterpretationResult {
  suggestedCategory: DocumentCategory;
  summary: string;
  extractedText: string;
  amounts: string[];
  keyDates: string[];
  issueDate: string | null;
  expiryDate: string | null;
  renewalDate: string | null;
  issuingAuthority: string | null;
  paymentObligations: string[];
  importantClauses: string[];
  missingInfo: string[];
  suggestedAction: {
    type: 'none' | 'create_payable' | 'create_compliance_reminder';
    label: string;
    payload?: Record<string, unknown>;
  };
  legalDisclaimer: string;
}

export type ComplianceClassification =
  | 'mandatory'
  | 'conditional'
  | 'recommended'
  | 'not_applicable'
  | 'requires_professional_review';

export interface ComplianceRule {
  id: string;
  area: string;
  name: string;
  description: string;
  applicableStructures: string[];
  applicableIndustries: string[];
  applicableLocations: string[];
  conditionsAndThresholds: string;
  exemptions: string;
  officialSourceName: string;
  officialSourceUrl: string;
  effectiveDate: string;
  lastVerifiedDate: string;
  reviewStatus: 'verified' | 'requires_local_check';
}

export interface ComplianceProgress {
  ownerUid: string;
  businessId: string;
  ruleId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
  notes?: string;
  linkedDocumentId?: string;
  renewalDate?: string;
  updatedAt?: string;
}

export interface ComplianceAssessmentItem {
  rule: ComplianceRule;
  classification: ComplianceClassification;
  reason: string;
  uncertaintyNote?: string;
  savedStatus: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
  linkedDocumentId?: string;
  renewalDate?: string;
  notes?: string;
}

export interface FinancialInsight {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  whatDetected: string;
  supportingRecords: Array<{ id: string; label: string; amount: number; date: string }>;
  whyItMatters: string;
  suggestedAction: string;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  netCashMovement: number;
  outstandingReceivables: number;
  outstandingPayables: number;
  paidTransactionsCount: number;
  pendingTransactionsCount: number;
  overdueCount: number;
  monthlyComparison: Array<{
    month: string;
    income: number;
    expenses: number;
    net: number;
  }>;
  categoryBreakdown: Array<{
    category: string;
    total: number;
    percentage: number;
    count: number;
  }>;
  topSuppliers: Array<{
    supplier: string;
    total: number;
    count: number;
  }>;
  recurringExpenses: Array<{
    description: string;
    merchant: string;
    averageAmount: number;
    occurrences: number;
  }>;
  insights: FinancialInsight[];
  accountingCaveat: string;
}

export interface ContactRecord {
  id: string;
  ownerUid: string;
  businessId: string;
  type: 'customer' | 'supplier';
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  vatNumber?: string;
  notes?: string;
  createdAt?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceRecord {
  id: string;
  ownerUid: string;
  businessId: string;
  docType: 'invoice' | 'quotation';
  number: string;
  customerName: string;
  customerEmail?: string;
  issueDate: string;
  dueDate?: string;
  items: InvoiceLineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  linkedTransactionId?: string;
  notes?: string;
  createdAt?: string;
}

export interface InventoryItem {
  id: string;
  ownerUid: string;
  businessId: string;
  sku?: string;
  name: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  costPrice: number;
  sellingPrice: number;
  supplierName?: string;
  updatedAt?: string;
}

export interface NotificationItem {
  id: string;
  ownerUid: string;
  businessId: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  actionTab?: string;
  createdAt: string;
}

export interface MarketplaceProduct {
  name: string;
  price: number;
  description: string;
}

export interface MarketplaceListing {
  id: string;
  businessId: string;
  ownerUid: string;
  businessName: string;
  category: string;
  location: string;
  province: SAProvince;
  description: string;
  products: MarketplaceProduct[];
  contactPhone?: string;
  contactEmail?: string;
  imageUrl?: string;
  verifiedDetails?: {
    registeredWithCipc?: boolean;
    vatRegistered?: boolean;
    disclaimer: string;
  };
  ratingAvg: number;
  reviewCount: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdviserCitation {
  sourceType: 'transaction' | 'document' | 'compliance' | 'business_profile';
  id: string;
  label: string;
  excerpt: string;
}

export interface AdviserResponse {
  answer: string;
  citations: AdviserCitation[];
  distinctions: string;
  proposedAction?: {
    requiresConfirmation: true;
    actionType: string;
    description: string;
    payload: Record<string, unknown>;
  };
}

export function formatZAR(value: number | null | undefined): string {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
