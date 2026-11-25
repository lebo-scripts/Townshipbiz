import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type {
  BusinessProfile,
  ComplianceProgress,
  ContactRecord,
  FinancialTransaction,
  InventoryItem,
  InvoiceRecord,
  MarketplaceListing,
  NotificationItem,
  UserProfile,
  VaultDocument,
} from '../../shared/types';
import { isEmailVerifiedUser } from './auth';
import { auth, db } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: { providerId?: string | null; email?: string | null }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- User Profile ---
export async function ensureUserProfile(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): Promise<UserProfile> {
  if (
    !auth.currentUser ||
    auth.currentUser.uid !== user.uid ||
    !isEmailVerifiedUser(auth.currentUser)
  ) {
    throw new Error('A signed-in user with a verified email is required to load a profile.');
  }

  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email || 'owner@townshipbiz.local',
      displayName: user.displayName || user.email?.split('@')[0] || 'Business Owner',
      planTier: 'free',
      popiaConsent: true,
      popiaConsentAt: nowIso(),
      retentionMonths: 60,
      notificationPrefs: {
        complianceDeadlines: true,
        expiringDocuments: true,
        unpaidInvoices: true,
        supplierPayments: true,
        unusualActivity: true,
        reminderDaysBefore: 30,
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await setDoc(ref, profile);
    return profile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateUserProfile(uid: string, patch: Partial<UserProfile>): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      ...patch,
      updatedAt: nowIso(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Audit Logs ---
export async function writeAuditLog(
  businessId: string,
  ownerUid: string,
  action: string,
  resourceType: string,
  summary: string
): Promise<void> {
  const id = makeId('aud');
  const path = `businesses/${businessId}/auditLogs/${id}`;
  try {
    await setDoc(doc(db, 'businesses', businessId, 'auditLogs', id), {
      ownerUid,
      businessId,
      actorUid: ownerUid,
      action,
      resourceType,
      summary: summary.slice(0, 380),
      createdAt: nowIso(),
    });
  } catch (err) {
    console.warn('Audit log write warning:', err);
  }
}

// --- Businesses ---
export function subscribeBusinesses(
  uid: string,
  onData: (businesses: BusinessProfile[]) => void,
  onError: (err: Error) => void
) {
  const path = 'businesses';
  const q = query(collection(db, 'businesses'), where('ownerUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as BusinessProfile), id: d.id }));
      onData(list);
    },
    (err) => {
      onError(err);
    }
  );
}

export async function createBusinessProfile(
  uid: string,
  data: Omit<BusinessProfile, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeId('biz');
  const path = `businesses/${id}`;
  try {
    const payload: BusinessProfile = {
      ...data,
      id,
      ownerUid: uid,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await setDoc(doc(db, 'businesses', id), payload);
    await writeAuditLog(id, uid, 'BUSINESS_CREATED', 'business', `Created business profile "${data.name}"`);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateBusinessProfile(
  businessId: string,
  uid: string,
  patch: Partial<BusinessProfile>
): Promise<void> {
  const path = `businesses/${businessId}`;
  try {
    await updateDoc(doc(db, 'businesses', businessId), {
      ...patch,
      updatedAt: nowIso(),
    });
    await writeAuditLog(businessId, uid, 'BUSINESS_UPDATED', 'business', 'Updated business profile settings');
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Subcollection Subscriptions ---
export function subscribeBusinessSubcollection<T>(
  businessId: string,
  subName: string,
  uid: string,
  onData: (items: T[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    collection(db, 'businesses', businessId, subName),
    where('ownerUid', '==', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }) as T);
      onData(items);
    },
    (err) => {
      console.error(`Subscription error (${subName}):`, err);
      onError?.(err);
    }
  );
}

// --- Transactions ---
export async function saveTransaction(
  businessId: string,
  uid: string,
  tx: Omit<FinancialTransaction, 'id' | 'ownerUid' | 'businessId' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || makeId('tx');
  const path = `businesses/${businessId}/transactions/${id}`;
  try {
    const payload = {
      ...tx,
      id,
      ownerUid: uid,
      businessId,
      currency: 'ZAR' as const,
      updatedAt: nowIso(),
      ...(existingId ? {} : { createdAt: nowIso() }),
    };
    await setDoc(doc(db, 'businesses', businessId, 'transactions', id), payload, { merge: true });
    await writeAuditLog(
      businessId,
      uid,
      existingId ? 'TX_UPDATED' : 'TX_CREATED',
      'transaction',
      `${tx.type} R${tx.amount.toFixed(2)} (${tx.category})`
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function removeTransaction(businessId: string, uid: string, txId: string): Promise<void> {
  const path = `businesses/${businessId}/transactions/${txId}`;
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'transactions', txId));
    await writeAuditLog(businessId, uid, 'TX_DELETED', 'transaction', `Deleted transaction ${txId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Custom Categories ---
export async function createCustomCategory(businessId: string, uid: string, name: string): Promise<void> {
  const id = makeId('cat');
  const path = `businesses/${businessId}/categories/${id}`;
  try {
    await setDoc(doc(db, 'businesses', businessId, 'categories', id), {
      ownerUid: uid,
      businessId,
      name: name.trim(),
      createdAt: nowIso(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

// --- Vault Documents ---
export async function saveVaultDocumentMetadata(
  businessId: string,
  uid: string,
  docData: Omit<VaultDocument, 'ownerUid' | 'businessId' | 'createdAt'>
): Promise<string> {
  const id = docData.id || makeId('doc');
  const path = `businesses/${businessId}/documents/${id}`;
  try {
    await setDoc(doc(db, 'businesses', businessId, 'documents', id), {
      ...docData,
      id,
      ownerUid: uid,
      businessId,
      createdAt: nowIso(),
    });
    await writeAuditLog(businessId, uid, 'DOC_UPLOADED', 'document', `Uploaded "${docData.name}" (${docData.category})`);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function removeVaultDocumentMetadata(businessId: string, uid: string, docId: string): Promise<void> {
  const path = `businesses/${businessId}/documents/${docId}`;
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'documents', docId));
    await writeAuditLog(businessId, uid, 'DOC_DELETED', 'document', `Deleted vault document ${docId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Contacts ---
export async function saveContact(
  businessId: string,
  uid: string,
  contact: Omit<ContactRecord, 'id' | 'ownerUid' | 'businessId' | 'createdAt'>
): Promise<string> {
  const id = makeId('cnt');
  const path = `businesses/${businessId}/contacts/${id}`;
  try {
    await setDoc(doc(db, 'businesses', businessId, 'contacts', id), {
      ...contact,
      id,
      ownerUid: uid,
      businessId,
      createdAt: nowIso(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteContact(businessId: string, contactId: string): Promise<void> {
  const path = `businesses/${businessId}/contacts/${contactId}`;
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'contacts', contactId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Invoices & Quotations ---
export async function saveInvoice(
  businessId: string,
  uid: string,
  invoice: Omit<InvoiceRecord, 'id' | 'ownerUid' | 'businessId' | 'createdAt'>
): Promise<string> {
  const id = makeId('inv');
  const path = `businesses/${businessId}/invoices/${id}`;
  try {
    await setDoc(doc(db, 'businesses', businessId, 'invoices', id), {
      ...invoice,
      id,
      ownerUid: uid,
      businessId,
      createdAt: nowIso(),
    });
    await writeAuditLog(businessId, uid, 'INVOICE_CREATED', 'invoice', `Created ${invoice.docType} ${invoice.number} for ${invoice.customerName}`);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markInvoicePaid(
  businessId: string,
  uid: string,
  invoice: InvoiceRecord
): Promise<void> {
  // Prevent duplicate transaction if already linked & paid
  if (invoice.status === 'paid' && invoice.linkedTransactionId) return;

  const txId = invoice.linkedTransactionId || makeId('tx');
  await saveTransaction(
    businessId,
    uid,
    {
      type: 'income',
      status: 'paid',
      amount: invoice.total,
      vatAmount: invoice.vatAmount,
      currency: 'ZAR',
      category: 'EFT & card sales',
      description: `Payment for ${invoice.number} (${invoice.customerName})`,
      merchantOrParty: invoice.customerName,
      paymentMethod: 'EFT',
      date: new Date().toISOString().slice(0, 10),
    },
    txId
  );

  const path = `businesses/${businessId}/invoices/${invoice.id}`;
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'invoices', invoice.id), {
      status: 'paid',
      linkedTransactionId: txId,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Inventory ---
export async function saveInventoryItem(
  businessId: string,
  uid: string,
  item: Omit<InventoryItem, 'id' | 'ownerUid' | 'businessId' | 'updatedAt'>,
  existingId?: string
): Promise<void> {
  const id = existingId || makeId('stk');
  const path = `businesses/${businessId}/inventory/${id}`;
  try {
    await setDoc(
      doc(db, 'businesses', businessId, 'inventory', id),
      {
        ...item,
        id,
        ownerUid: uid,
        businessId,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteInventoryItem(businessId: string, itemId: string): Promise<void> {
  const path = `businesses/${businessId}/inventory/${itemId}`;
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'inventory', itemId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Compliance Progress ---
export async function saveComplianceProgress(
  businessId: string,
  uid: string,
  progress: Omit<ComplianceProgress, 'ownerUid' | 'businessId' | 'updatedAt'>
): Promise<void> {
  const path = `businesses/${businessId}/complianceItems/${progress.ruleId}`;
  try {
    await setDoc(
      doc(db, 'businesses', businessId, 'complianceItems', progress.ruleId),
      {
        ...progress,
        ownerUid: uid,
        businessId,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    await writeAuditLog(
      businessId,
      uid,
      'COMPLIANCE_UPDATED',
      'compliance',
      `Set ${progress.ruleId} to ${progress.status}`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- Notifications ---
export async function createNotification(
  businessId: string,
  uid: string,
  notif: Omit<NotificationItem, 'id' | 'ownerUid' | 'businessId' | 'createdAt'>
): Promise<void> {
  const id = makeId('ntf');
  const path = `businesses/${businessId}/notifications/${id}`;
  try {
    await setDoc(doc(db, 'businesses', businessId, 'notifications', id), {
      ...notif,
      id,
      ownerUid: uid,
      businessId,
      createdAt: nowIso(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markNotificationRead(businessId: string, notifId: string): Promise<void> {
  const path = `businesses/${businessId}/notifications/${notifId}`;
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'notifications', notifId), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// --- Marketplace ---
export function subscribeMarketplace(onData: (listings: MarketplaceListing[]) => void) {
  const q = query(collection(db, 'marketplace'), where('active', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ ...(d.data() as MarketplaceListing), id: d.id }));
      onData(list);
    },
    (err) => {
      console.error('Marketplace subscription error:', err);
    }
  );
}

export async function publishMarketplaceListing(
  uid: string,
  listing: Omit<MarketplaceListing, 'id' | 'ownerUid' | 'ratingAvg' | 'reviewCount' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = `mkt_${listing.businessId}`;
  const path = `marketplace/${id}`;
  try {
    await setDoc(
      doc(db, 'marketplace', id),
      {
        ...listing,
        id,
        ownerUid: uid,
        ratingAvg: 0,
        reviewCount: 0,
        updatedAt: nowIso(),
        createdAt: nowIso(),
      },
      { merge: true }
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchListingReviews(
  listingId: string
): Promise<Array<{ id: string; authorName?: string; rating?: number; comment?: string; createdAt?: string }>> {
  const q = query(collection(db, 'marketplace', listingId, 'reviews'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as { authorName?: string; rating?: number; comment?: string; createdAt?: string }),
  }));
}

export async function submitListingReview(
  listingId: string,
  uid: string,
  authorName: string,
  rating: number,
  comment: string
): Promise<void> {
  const id = makeId('rev');
  const path = `marketplace/${listingId}/reviews/${id}`;
  try {
    await setDoc(doc(db, 'marketplace', listingId, 'reviews', id), {
      authorUid: uid,
      authorName,
      rating,
      comment,
      createdAt: nowIso(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function submitMarketplaceEnquiry(
  listingId: string,
  businessOwnerUid: string,
  senderUid: string,
  senderName: string,
  senderContact: string,
  message: string
): Promise<void> {
  const id = makeId('enq');
  const path = `marketplace/${listingId}/enquiries/${id}`;
  try {
    await setDoc(doc(db, 'marketplace', listingId, 'enquiries', id), {
      senderUid,
      businessOwnerUid,
      senderName,
      senderContact,
      message,
      createdAt: nowIso(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function reportMarketplaceListing(
  listingId: string,
  reporterUid: string,
  reason: string
): Promise<void> {
  const id = makeId('rep');
  const path = `marketplace/${listingId}/reports/${id}`;
  try {
    await setDoc(doc(db, 'marketplace', listingId, 'reports', id), {
      reporterUid,
      reason,
      createdAt: nowIso(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

// --- Bulk clear user-owned transactions ---
export async function clearAllBusinessTransactions(businessId: string, uid: string): Promise<number> {
  const path = `businesses/${businessId}/transactions`;
  try {
    const q = query(collection(db, 'businesses', businessId, 'transactions'), where('ownerUid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return 0;

    let deleted = 0;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + 400);
      for (const d of chunk) {
        batch.delete(d.ref);
        deleted++;
      }
      await batch.commit();
    }
    await writeAuditLog(businessId, uid, 'TX_CLEARED', 'transaction', `Cleared ${deleted} transactions`);
    return deleted;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

void addDoc;
