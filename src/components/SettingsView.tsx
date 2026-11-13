import React, { useState } from 'react';
import { Bell, Building2, Check, Lock, Plus, Shield } from 'lucide-react';
import type {
  BusinessProfile,
  NotificationPreferences,
  PlanTier,
  UserProfile,
} from '../../shared/types';
import {
  updateBusinessProfile,
  updateUserProfile,
} from '../lib/db';

interface SettingsViewProps {
  userProfile: UserProfile;
  businesses: BusinessProfile[];
  activeBusiness: BusinessProfile;
  auditLogs: Array<{ id: string; action: string; resourceType: string; summary: string; createdAt: string }>;
  onSelectBusiness: (id: string) => void;
  onCreateNewBusiness: () => void;
}

const PLANS: Array<{
  tier: PlanTier;
  name: string;
  price: string;
  audience: string;
  features: string[];
}> = [
  {
    tier: 'free',
    name: 'Free',
    price: 'R0 / month',
    audience: 'For informal traders starting digital records',
    features: [
      'Basic business profile & local marketplace listing',
      'Core income & expense tracking (up to 50 entries/mo)',
      'Initial South African compliance assessment',
      'Limited private document storage (up to 10 files)',
    ],
  },
  {
    tier: 'starter',
    name: 'Starter',
    price: 'R149 / month',
    audience: 'For growing spaza shops, salons, and food vendors',
    features: [
      'AI receipt scanning & duplicate till-slip detection',
      'Full expense categorisation & CSV/PDF reports',
      'Ongoing compliance tracking & expiry reminders',
      'Document vault with AI date & clause extraction',
    ],
  },
  {
    tier: 'growth',
    name: 'Growth',
    price: 'R349 / month',
    audience: 'For established SMEs and multi-site operators',
    features: [
      'Advanced AI anomaly insights & conversational adviser',
      'Expanded vault storage & multi-business management',
      'Full invoicing, quotations, supplier ledger & stock control',
      'Enhanced marketplace visibility & priority tools',
    ],
  },
];

export function SettingsView({
  userProfile,
  businesses,
  activeBusiness,
  auditLogs,
  onSelectBusiness,
  onCreateNewBusiness,
}: SettingsViewProps) {
  const [bizName, setBizName] = useState(activeBusiness.name);
  const [bizLocation, setBizLocation] = useState(activeBusiness.location);
  const [bizMunicipality, setBizMunicipality] = useState(activeBusiness.municipality || '');
  const [employeeCount, setEmployeeCount] = useState(activeBusiness.employeeCount);
  const [vatRegistered, setVatRegistered] = useState(activeBusiness.vatRegistered);
  const [retentionMonths, setRetentionMonths] = useState(userProfile.retentionMonths || 60);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    userProfile.notificationPrefs || {
      complianceDeadlines: true,
      expiringDocuments: true,
      unpaidInvoices: true,
      supplierPayments: true,
      unusualActivity: true,
      reminderDaysBefore: 30,
    }
  );
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateBusinessProfile(activeBusiness.id, userProfile.uid, {
      name: bizName.trim(),
      location: bizLocation.trim(),
      municipality: bizMunicipality.trim(),
      employeeCount: Math.max(0, Number(employeeCount) || 0),
      vatRegistered,
    });
    setSavedMsg('Business profile updated.');
  };

  const handleSavePreferences = async () => {
    await updateUserProfile(userProfile.uid, {
      notificationPrefs: prefs,
      retentionMonths,
    });
    setSavedMsg('Notification and POPIA retention preferences saved.');
  };

  const handleSelectPlan = async (tier: PlanTier) => {
    await updateUserProfile(userProfile.uid, { planTier: tier });
    setSavedMsg(
      `Plan updated to ${tier.toUpperCase()}. Live card billing is disabled until payment gateway credentials are configured.`
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings, Security & Plans</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your businesses, notification alerts, POPIA data retention, subscription tier, and
          security audit trail.
        </p>
      </div>

      {savedMsg && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3.5 text-sm text-teal-900">
          {savedMsg}
        </div>
      )}

      {/* Multi-Business Management */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-teal-700" />
            <span>Your Businesses ({businesses.length})</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCreateNewBusiness}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Another Business</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelectBusiness(b.id)}
              className={`rounded-lg border p-3.5 text-left transition-colors cursor-pointer ${
                b.id === activeBusiness.id
                  ? 'border-teal-700 bg-teal-50/40'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className="text-sm font-semibold text-slate-900">{b.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {b.industry} · {b.location}
              </p>
            </button>
          ))}
        </div>

        <form onSubmit={handleSaveBusiness} className="border-t border-slate-100 pt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">Active Business Name</label>
            <input
              type="text"
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Location</label>
            <input
              type="text"
              value={bizLocation}
              onChange={(e) => setBizLocation(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Municipality</label>
            <input
              type="text"
              value={bizMunicipality}
              onChange={(e) => setBizMunicipality(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Employees</label>
            <input
              type="number"
              min={0}
              value={employeeCount}
              onChange={(e) => setEmployeeCount(Number(e.target.value))}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 text-sm font-mono"
            />
          </div>
          <div className="sm:col-span-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={vatRegistered}
                onChange={(e) => setVatRegistered(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-700"
              />
              <span>VAT registered (15% SARS VAT vendor)</span>
            </label>
            <button
              type="submit"
              className="min-h-[40px] rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              Update Active Business
            </button>
          </div>
        </form>
      </section>

      {/* Notifications & POPIA Data Governance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Bell className="h-4 w-4 text-teal-700" />
            <span>Notification Preferences</span>
          </h2>
          <div className="space-y-2.5 text-sm text-slate-700">
            {(
              [
                ['complianceDeadlines', 'Upcoming SA compliance deadlines & annual returns'],
                ['expiringDocuments', 'Expiring permits, leases, and certificates'],
                ['unpaidInvoices', 'Overdue & unpaid customer invoices'],
                ['supplierPayments', 'Upcoming supplier payment due dates'],
                ['unusualActivity', 'Unusual financial spikes or duplicate receipt alerts'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="pt-2">
            <label className="block text-xs font-medium text-slate-700">
              Advance reminder window (days before expiry)
            </label>
            <input
              type="number"
              min={7}
              max={90}
              value={prefs.reminderDaysBefore}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, reminderDaysBefore: Number(e.target.value) || 30 }))
              }
              className="mt-1 min-h-[40px] w-28 rounded-lg border border-slate-300 px-3 text-sm font-mono"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Lock className="h-4 w-4 text-teal-700" />
            <span>POPIA Privacy & Data Retention</span>
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            TownshipBiz isolates your records by business ownership, stores private documents outside
            public URLs, and sends only minimal retrieved context to AI services.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Financial & tax document retention period (SARS recommends 60 months / 5 years)
            </label>
            <select
              value={retentionMonths}
              onChange={(e) => setRetentionMonths(Number(e.target.value))}
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value={12}>12 months</option>
              <option value={36}>36 months (3 years)</option>
              <option value={60}>60 months (5 years — SARS standard)</option>
              <option value={84}>84 months (7 years)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleSavePreferences}
            className="min-h-[42px] rounded-lg bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
          >
            Save Notification & POPIA Settings
          </button>
        </section>
      </div>

      {/* Freemium Plans */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Subscription Plan</h2>
          <p className="text-xs text-slate-600">
            Current tier: <strong className="uppercase">{userProfile.planTier}</strong> · Payment
            checkout activates once live South African gateway credentials (e.g. PayFast / Yoco) are
            configured.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const active = userProfile.planTier === plan.tier;
            return (
              <div
                key={plan.tier}
                className={`rounded-xl border bg-white p-5 flex flex-col justify-between ${
                  active ? 'border-teal-700' : 'border-slate-200'
                }`}
              >
                <div>
                  <p className="text-xs text-slate-500">{plan.audience}</p>
                  <div className="mt-1 flex items-baseline justify-between">
                    <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                    <span className="font-mono text-sm font-bold text-slate-900">{plan.price}</span>
                  </div>
                  <ul className="mt-4 space-y-2 text-xs text-slate-700">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 shrink-0 text-teal-700 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  disabled={active}
                  onClick={() => handleSelectPlan(plan.tier)}
                  className={`mt-5 min-h-[42px] w-full rounded-lg text-xs font-semibold cursor-pointer ${
                    active
                      ? 'bg-slate-100 text-slate-500 cursor-default'
                      : 'bg-teal-700 text-white hover:bg-teal-800'
                  }`}
                >
                  {active ? 'Current Plan' : `Switch to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Security Audit Log */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Shield className="h-4 w-4 text-teal-700" />
          <span>Security & Financial Audit Log</span>
        </h2>
        {auditLogs.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No audit events recorded yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100 text-xs max-h-64 overflow-y-auto">
            {auditLogs.slice(0, 20).map((log) => (
              <div key={log.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
                <span>
                  <strong className="font-mono text-slate-800">{log.action}</strong> · {log.summary}
                </span>
                <span className="font-mono text-slate-500 shrink-0">
                  {log.createdAt.slice(0, 16).replace('T', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
