import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  Bell,
  Bot,
  Briefcase,
  Camera,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Store,
  Wallet,
  X,
} from 'lucide-react';
import type {
  BusinessProfile,
  ComplianceAssessmentItem,
  ComplianceProgress,
  ContactRecord,
  FinancialSummary,
  FinancialTransaction,
  InventoryItem,
  InvoiceRecord,
  MarketplaceListing,
  NotificationItem,
  UserProfile,
  VaultDocument,
} from '../shared/types';
import { AdviserView } from './components/AdviserView';
import { AuthScreen } from './components/AuthScreen';
import { BusinessToolsView } from './components/BusinessToolsView';
import { ComplianceView } from './components/ComplianceView';
import { DashboardView } from './components/DashboardView';
import { DocumentVaultView } from './components/DocumentVaultView';
import { FinancesView } from './components/FinancesView';
import { MarketplaceView } from './components/MarketplaceView';
import { OnboardingWizard } from './components/OnboardingWizard';
import { ReceiptScannerView } from './components/ReceiptScannerView';
import { SettingsView } from './components/SettingsView';
import {
  assessComplianceApi,
  downloadPrivateDocumentApi,
  fetchAnalyticsSummaryApi,
} from './lib/api';
import {
  ensureUserProfile,
  markNotificationRead,
  subscribeBusinesses,
  subscribeBusinessSubcollection,
  subscribeMarketplace,
} from './lib/db';
import { auth, testFirestoreConnection } from './lib/firebase';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'finances', label: 'Finances', icon: Wallet },
  { id: 'scan', label: 'Scan Receipt', icon: Camera },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { id: 'marketplace', label: 'Marketplace', icon: Store },
  { id: 'tools', label: 'Business Tools', icon: Briefcase },
  { id: 'adviser', label: 'AI Assistant', icon: Bot },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

const EMPTY_SUMMARY: FinancialSummary = {
  totalIncome: 0,
  totalExpenses: 0,
  netCashMovement: 0,
  outstandingReceivables: 0,
  outstandingPayables: 0,
  paidTransactionsCount: 0,
  pendingTransactionsCount: 0,
  overdueCount: 0,
  monthlyComparison: [],
  categoryBreakdown: [],
  topSuppliers: [],
  recurringExpenses: [],
  insights: [],
  accountingCaveat: 'Record income and expenses to view cash-flow analytics.',
};

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [businesses, setBusinesses] = useState<BusinessProfile[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string>('');
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Business subcollection data
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [customCategories, setCustomCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [complianceProgress, setComplianceProgress] = useState<ComplianceProgress[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<
    Array<{ id: string; action: string; resourceType: string; summary: string; createdAt: string }>
  >([]);
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);

  // Backend-computed deterministic summary & compliance assessment
  const [summary, setSummary] = useState<FinancialSummary>(EMPTY_SUMMARY);
  const [complianceItems, setComplianceItems] = useState<ComplianceAssessmentItem[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (user) {
        await testFirestoreConnection();
        const profile = await ensureUserProfile({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        });
        setUserProfile(profile);
      } else {
        setUserProfile(null);
        setBusinesses([]);
        setActiveBusinessId('');
        setTransactions([]);
        setDocuments([]);
        setCustomCategories([]);
        setContacts([]);
        setInvoices([]);
        setInventory([]);
        setComplianceProgress([]);
        setNotifications([]);
        setAuditLogs([]);
        setSummary(EMPTY_SUMMARY);
        setComplianceItems([]);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsubMkt = subscribeMarketplace(setMarketplaceListings);
    return unsubMkt;
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const unsub = subscribeBusinesses(
      authUser.uid,
      (list) => {
        setBusinesses(list);
        if (list.length > 0 && !list.some((b) => b.id === activeBusinessId)) {
          setActiveBusinessId(list[0].id);
        }
      },
      (err) => console.error('Failed to load businesses:', err)
    );
    return unsub;
  }, [authUser, activeBusinessId]);

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.id === activeBusinessId) || null,
    [businesses, activeBusinessId]
  );

  // Subscribe to all isolated subcollections for the active business
  useEffect(() => {
    setTransactions([]);
    setDocuments([]);
    setCustomCategories([]);
    setContacts([]);
    setInvoices([]);
    setInventory([]);
    setComplianceProgress([]);
    setNotifications([]);
    setAuditLogs([]);
    setSummary(EMPTY_SUMMARY);
    setComplianceItems([]);

    if (!authUser || !activeBusiness) return;
    const uid = authUser.uid;
    const bid = activeBusiness.id;

    const unsubs = [
      subscribeBusinessSubcollection<FinancialTransaction>(bid, 'transactions', uid, setTransactions),
      subscribeBusinessSubcollection<VaultDocument>(bid, 'documents', uid, setDocuments),
      subscribeBusinessSubcollection<{ id: string; name: string }>(
        bid,
        'categories',
        uid,
        setCustomCategories
      ),
      subscribeBusinessSubcollection<ContactRecord>(bid, 'contacts', uid, setContacts),
      subscribeBusinessSubcollection<InvoiceRecord>(bid, 'invoices', uid, setInvoices),
      subscribeBusinessSubcollection<InventoryItem>(bid, 'inventory', uid, setInventory),
      subscribeBusinessSubcollection<ComplianceProgress>(
        bid,
        'complianceItems',
        uid,
        setComplianceProgress
      ),
      subscribeBusinessSubcollection<NotificationItem>(bid, 'notifications', uid, setNotifications),
      subscribeBusinessSubcollection<{
        id: string;
        action: string;
        resourceType: string;
        summary: string;
        createdAt: string;
      }>(bid, 'auditLogs', uid, setAuditLogs),
    ];

    return () => unsubs.forEach((u) => u());
  }, [authUser, activeBusiness]);

  // Recompute backend analytics when transactions change
  useEffect(() => {
    if (!authUser || !activeBusiness) return;
    let cancelled = false;
    fetchAnalyticsSummaryApi(transactions)
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch((err) => console.warn('Analytics calculation warning:', err));
    return () => {
      cancelled = true;
    };
  }, [authUser, activeBusiness, transactions]);

  // Recompute backend compliance assessment when profile or saved progress changes
  useEffect(() => {
    if (!authUser || !activeBusiness) return;
    let cancelled = false;
    const savedMap: Record<
      string,
      { status: string; linkedDocumentId?: string; renewalDate?: string; notes?: string }
    > = {};
    for (const item of complianceProgress) {
      savedMap[item.ruleId] = {
        status: item.status,
        linkedDocumentId: item.linkedDocumentId,
        renewalDate: item.renewalDate,
        notes: item.notes,
      };
    }

    assessComplianceApi(activeBusiness, savedMap)
      .then((res) => {
        if (!cancelled) setComplianceItems(res.items);
      })
      .catch((err) => console.warn('Compliance assessment warning:', err));
    return () => {
      cancelled = true;
    };
  }, [authUser, activeBusiness, complianceProgress]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading TownshipBiz...
      </div>
    );
  }

  if (!authUser || !userProfile) {
    return <AuthScreen />;
  }

  if (businesses.length === 0 || creatingBusiness) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between pb-4">
          <span className="text-lg font-bold text-slate-900">TownshipBiz</span>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Sign Out
          </button>
        </div>
        <OnboardingWizard
          uid={authUser.uid}
          userEmail={authUser.email || ''}
          onCreated={(bizId) => {
            setActiveBusinessId(bizId);
            setCreatingBusiness(false);
          }}
          onCancel={businesses.length > 0 ? () => setCreatingBusiness(false) : undefined}
        />
      </div>
    );
  }

  if (!activeBusiness) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleDownloadReceipt = async (docId: string) => {
    const docMatch = documents.find((d) => d.id === docId);
    await downloadPrivateDocumentApi(
      activeBusiness.id,
      docId,
      docMatch?.name || `receipt-${docId}.jpg`
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar (248px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center px-5 border-b border-slate-200">
          <span className="text-lg font-bold tracking-tight text-slate-900">TownshipBiz</span>
        </div>

        <div className="p-4 border-b border-slate-100">
          <label className="block text-xs font-medium text-slate-500">Active Business</label>
          <select
            aria-label="Select business"
            value={activeBusiness.id}
            onChange={(e) => setActiveBusinessId(e.target.value)}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm font-semibold text-slate-900"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-teal-50 text-teal-800 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">{userProfile.displayName}</p>
            <p className="truncate text-xs text-slate-500">{userProfile.planTier} plan</p>
          </div>
          <button
            type="button"
            onClick={() => signOut(auth)}
            aria-label="Sign out"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar (compact <=48px on mobile so header + bottom bar stays <15% viewport height) */}
        <header className="sticky top-0 z-30 h-12 lg:h-16 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden text-base font-bold text-slate-900 whitespace-nowrap">
              TownshipBiz
            </span>
            <span className="hidden lg:inline text-sm font-medium text-slate-600 truncate">
              {activeBusiness.name} / {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Notifications"
              className="relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 text-[10px] font-mono font-bold text-red-700">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className="hidden sm:inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap cursor-pointer"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Scan Receipt</span>
            </button>
          </div>
        </header>

        {/* Notifications Panel */}
        {notifOpen && (
          <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="mx-auto max-w-4xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">
                  Business Alerts & Reminders ({unreadCount} unread)
                </span>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Close
                </button>
              </div>
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-500">No active alerts or reminders.</p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                  {notifications.map((n) => (
                    <div key={n.id} className="flex items-center justify-between py-2 gap-3 text-xs">
                      <div>
                        <p className={`font-semibold ${n.read ? 'text-slate-600' : 'text-slate-900'}`}>
                          {n.title}
                        </p>
                        <p className="text-slate-500">{n.message}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {n.actionTab && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab(n.actionTab!);
                              setNotifOpen(false);
                            }}
                            className="font-semibold text-teal-700 hover:underline cursor-pointer"
                          >
                            Open
                          </button>
                        )}
                        {!n.read && (
                          <button
                            type="button"
                            onClick={() => markNotificationRead(activeBusiness.id, n.id)}
                            className="text-slate-500 hover:text-slate-900 cursor-pointer"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Workspace Content */}
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 pb-20 lg:pb-8 sm:px-6 lg:px-8">
          {activeTab === 'dashboard' && (
            <DashboardView
              business={activeBusiness}
              summary={summary}
              transactions={transactions}
              documents={documents}
              compliance={complianceItems}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'finances' && (
            <FinancesView
              business={activeBusiness}
              uid={authUser.uid}
              transactions={transactions}
              customCategories={customCategories}
              contacts={contacts}
              summary={summary}
              onDownloadReceipt={handleDownloadReceipt}
            />
          )}
          {activeTab === 'scan' && (
            <ReceiptScannerView
              business={activeBusiness}
              uid={authUser.uid}
              transactions={transactions}
              onSaved={() => setActiveTab('finances')}
            />
          )}
          {activeTab === 'documents' && (
            <DocumentVaultView
              business={activeBusiness}
              uid={authUser.uid}
              documents={documents}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'compliance' && (
            <ComplianceView
              business={activeBusiness}
              uid={authUser.uid}
              items={complianceItems}
              documents={documents}
            />
          )}
          {activeTab === 'marketplace' && (
            <MarketplaceView
              business={activeBusiness}
              uid={authUser.uid}
              userName={userProfile.displayName}
              listings={marketplaceListings}
            />
          )}
          {activeTab === 'tools' && (
            <BusinessToolsView
              business={activeBusiness}
              uid={authUser.uid}
              invoices={invoices}
              contacts={contacts}
              inventory={inventory}
              transactions={transactions}
            />
          )}
          {activeTab === 'adviser' && (
            <AdviserView
              business={activeBusiness}
              transactions={transactions}
              documents={documents}
              compliance={complianceItems}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsView
              userProfile={userProfile}
              businesses={businesses}
              activeBusiness={activeBusiness}
              auditLogs={auditLogs}
              onSelectBusiness={(id) => setActiveBusinessId(id)}
              onCreateNewBusiness={() => setCreatingBusiness(true)}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Thumb-Zone Bar (52px height; total sticky = 48+52 = 100px <= 15% of viewport) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-[52px] border-t border-slate-200 bg-white/95 backdrop-blur-md grid grid-cols-5">
        {[
          { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
          { id: 'finances', label: 'Finances', icon: Wallet },
          { id: 'scan', label: 'Scan', icon: Camera },
          { id: 'documents', label: 'Vault', icon: FileText },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`flex min-h-[44px] flex-col items-center justify-center text-[11px] font-medium cursor-pointer ${
                active ? 'text-teal-700 font-semibold' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-0.5">{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className={`flex min-h-[44px] flex-col items-center justify-center text-[11px] font-medium cursor-pointer ${
            mobileMenuOpen ? 'text-teal-700 font-semibold' : 'text-slate-500'
          }`}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span className="mt-0.5">More</span>
        </button>
      </nav>

      {/* Mobile "More" Sheet */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="fixed bottom-[52px] left-0 right-0 rounded-t-2xl bg-white p-4 border-t border-slate-200 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            {NAV_ITEMS.filter((i) => !['dashboard', 'finances', 'scan', 'documents'].includes(i.id)).map(
              (item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    <Icon className="h-4 w-4 text-teal-700" />
                    <span>{item.label}</span>
                  </button>
                );
              }
            )}
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
