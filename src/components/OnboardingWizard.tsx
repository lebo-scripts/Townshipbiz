import React, { useState } from 'react';
import type { BusinessStructure, SAProvince } from '../../shared/types';
import { createBusinessProfile } from '../lib/db';

const PROVINCES: SAProvince[] = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Free State',
  'Northern Cape',
];

const INDUSTRIES = [
  'Spaza & Grocery Retail',
  'Food Vendor & Restaurant',
  'Hair Salon & Barber',
  'General Retail',
  'Freelance & Professional Services',
  'Trades & Maintenance',
  'Transport & Delivery',
  'Agriculture & Fresh Produce',
  'Clothing & Tailoring',
  'Technology & Startup',
];

const TURNOVER_RANGES = [
  'Under R50,000 / year',
  'R50,000 - R300,000 / year',
  'R300,000 - R1,000,000 / year',
  'Above R1,000,000 / year',
];

interface OnboardingWizardProps {
  uid: string;
  userEmail: string;
  onCreated: (businessId: string) => void;
  onCancel?: () => void;
}

export function OnboardingWizard({ uid, userEmail, onCreated, onCancel }: OnboardingWizardProps) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [structure, setStructure] = useState<BusinessStructure>('informal');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState('');
  const [location, setLocation] = useState('Soweto, Orlando West');
  const [municipality, setMunicipality] = useState('City of Johannesburg');
  const [province, setProvince] = useState<SAProvince>('Gauteng');
  const [employeeCount, setEmployeeCount] = useState(0);
  const [annualTurnoverRange, setAnnualTurnoverRange] = useState(TURNOVER_RANGES[1]);
  const [phone, setPhone] = useState('');
  const [operatingHours, setOperatingHours] = useState('Mon-Sat 07:00 - 19:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Please enter your business name.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const bizId = await createBusinessProfile(uid, {
        name: name.trim(),
        industry,
        structure,
        registrationNumber: registrationNumber.trim(),
        vatRegistered,
        vatNumber: vatRegistered ? vatNumber.trim() : '',
        location: location.trim(),
        municipality: municipality.trim(),
        province,
        employeeCount: Math.max(0, Number(employeeCount) || 0),
        annualTurnoverRange,
        operatingHours: operatingHours.trim(),
        phone: phone.trim(),
        email: userEmail,
        marketplaceListed: false,
      });

      onCreated(bizId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create business profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Set up your business profile</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          TownshipBiz uses these details to personalise your South African compliance checklist, ZAR
          financial tracking, and optional marketplace listing.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Business or trading name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Thando's Spaza & Fresh Produce"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Industry</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Business structure</label>
              <select
                value={structure}
                onChange={(e) => setStructure(e.target.value as BusinessStructure)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              >
                <option value="informal">Informal Trader (unregistered)</option>
                <option value="sole_proprietor">Sole Proprietor</option>
                <option value="pty_ltd">Private Company ((Pty) Ltd)</option>
                <option value="cooperative">Cooperative</option>
                <option value="npo">Non-Profit Organisation (NPO/NPC)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Township / Suburb / City</label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Khayelitsha, Cape Town"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Province</label>
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value as SAProvince)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              >
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Local Municipality</label>
              <input
                type="text"
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                placeholder="e.g. City of Johannesburg / eThekwini"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Number of employees</label>
              <input
                type="number"
                min={0}
                max={10000}
                value={employeeCount}
                onChange={(e) => setEmployeeCount(Number(e.target.value))}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Estimated annual turnover</label>
              <select
                value={annualTurnoverRange}
                onChange={(e) => setAnnualTurnoverRange(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              >
                {TURNOVER_RANGES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Contact phone / WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 082 555 0142"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                CIPC Registration No. (optional)
              </label>
              <input
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="e.g. 2024/123456/07"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Operating hours</label>
              <input
                type="text"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={vatRegistered}
                onChange={(e) => setVatRegistered(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-700"
              />
              <span>This business is registered for SARS VAT (15%)</span>
            </label>
            {vatRegistered && (
              <input
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="10-digit SARS VAT number"
                className="min-h-[44px] w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              />
            )}

          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-lg bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Creating Business...' : 'Create Business Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
