import React, { useMemo, useState } from 'react';
import { Flag, MapPin, MessageSquare, Search, Star, Store } from 'lucide-react';
import type { BusinessProfile, MarketplaceListing, MarketplaceProduct } from '../../shared/types';
import { formatZAR } from '../../shared/types';
import {
  fetchListingReviews,
  publishMarketplaceListing,
  reportMarketplaceListing,
  submitListingReview,
  submitMarketplaceEnquiry,
  updateBusinessProfile,
} from '../lib/db';

const COMMUNITY_SHOWCASE: MarketplaceListing[] = [
  {
    id: 'showcase_spaza',
    businessId: 'showcase_1',
    ownerUid: 'community',
    businessName: "Thando's Community Market",
    category: 'Spaza & Grocery Retail',
    location: 'Orlando West, Soweto',
    province: 'Gauteng',
    description:
      'Daily fresh produce, maize meal, bread, airtime, and household staples at fair neighbourhood prices.',
    products: [
      { name: 'Fresh Tomatoes (1kg)', price: 20, description: 'Locally sourced farm tomatoes' },
      { name: 'Ripe Avocados (Each)', price: 10, description: 'Fresh daily stock' },
    ],
    contactPhone: '011 935 0118',
    imageUrl: '/src/assets/images/marketplace_spaza_fresh_1794560924316.jpg',
    ratingAvg: 4.8,
    reviewCount: 14,
    active: true,
  },
  {
    id: 'showcase_kota',
    businessId: 'showcase_2',
    ownerUid: 'community',
    businessName: 'Kasi Gourmet Kitchen',
    category: 'Food Vendor & Restaurant',
    location: 'Site B, Khayelitsha',
    province: 'Western Cape',
    description: 'Freshly prepared gourmet bunny chow, signature kotas, and braai platters for walk-in and event orders.',
    products: [
      { name: 'Signature Kota Special', price: 65, description: 'Chips, Russian, cheese, atchar & egg' },
      { name: 'Half Loaf Beef Bunny Chow', price: 95, description: 'Slow-cooked Durban curry' },
    ],
    contactPhone: '021 361 4402',
    imageUrl: '/src/assets/images/marketplace_kota_kitchen_1794560924995.jpg',
    ratingAvg: 4.9,
    reviewCount: 22,
    active: true,
  },
  {
    id: 'showcase_salon',
    businessId: 'showcase_3',
    ownerUid: 'community',
    businessName: 'Legacy Grooming Soweto',
    category: 'Hair Salon & Barber',
    location: 'Vilakazi Street, Soweto',
    province: 'Gauteng',
    description: 'Clean skin fades, beard grooming, knotless braids, and natural hair treatments.',
    products: [
      { name: 'Precision Fade & Beard Trim', price: 120, description: 'Hot towel finish' },
      { name: 'Knotless Box Braids', price: 450, description: 'Medium length styling' },
    ],
    contactPhone: '082 441 7790',
    imageUrl: '/src/assets/images/marketplace_hair_studio_1794560924457.jpg',
    ratingAvg: 4.7,
    reviewCount: 19,
    active: true,
  },
  {
    id: 'showcase_tailor',
    businessId: 'showcase_4',
    ownerUid: 'community',
    businessName: 'Naledi Shweshwe Atelier',
    category: 'Clothing & Tailoring',
    location: 'Umlazi V Section, Durban',
    province: 'KwaZulu-Natal',
    description: 'Bespoke shweshwe dresses, tailored jackets, matric outfits, and garment alterations.',
    products: [
      { name: 'Custom Shweshwe Dress', price: 950, description: 'Tailored to your measurements' },
      { name: 'School Uniform Alterations', price: 110, description: 'Same-week turnaround' },
    ],
    contactPhone: '031 907 2214',
    imageUrl: '/src/assets/images/marketplace_tailor_craft_1794560924944.jpg',
    ratingAvg: 5.0,
    reviewCount: 9,
    active: true,
  },
];

interface MarketplaceViewProps {
  business: BusinessProfile;
  uid: string;
  userName: string;
  listings: MarketplaceListing[];
}

export function MarketplaceView({ business, uid, userName, listings }: MarketplaceViewProps) {
  const [search, setSearch] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('all');
  const [showPublishForm, setShowPublishForm] = useState(false);

  // Publish state
  const [description, setDescription] = useState(
    `${business.name} — reliable ${business.industry} serving ${business.location}.`
  );
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [shareCipcStatus, setShareCipcStatus] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Active listing drawer state
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [reviews, setReviews] = useState<Array<{ id: string; authorName: string; rating: number; comment: string }>>([]);
  const [enquiryMsg, setEnquiryMsg] = useState('');
  const [enquiryContact, setEnquiryContact] = useState(business.phone || '');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const combinedListings = useMemo(() => {
    const ids = new Set(listings.map((l) => l.id));
    return [...listings, ...COMMUNITY_SHOWCASE.filter((s) => !ids.has(s.id))];
  }, [listings]);

  const filtered = useMemo(() => {
    return combinedListings.filter((l) => {
      if (provinceFilter !== 'all' && l.province !== provinceFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${l.businessName} ${l.category} ${l.location} ${l.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [combinedListings, provinceFilter, search]);

  const handleAddProduct = () => {
    if (!productName.trim() || !productPrice) return;
    setProducts((prev) => [
      ...prev,
      {
        name: productName.trim(),
        price: Number(productPrice) || 0,
        description: productDesc.trim() || 'Local product or service',
      },
    ]);
    setProductName('');
    setProductPrice('');
    setProductDesc('');
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishing(true);
    setFeedback(null);
    try {
      await publishMarketplaceListing(uid, {
        businessId: business.id,
        businessName: business.name,
        category: business.industry,
        location: business.location,
        province: business.province,
        description: description.trim(),
        products,
        contactPhone: business.phone || '',
        contactEmail: business.email || '',
        verifiedDetails: shareCipcStatus
          ? {
              registeredWithCipc: Boolean(business.registrationNumber),
              vatRegistered: business.vatRegistered,
              disclaimer: 'Self-reported business profile — not government certification.',
            }
          : undefined,
        active: true,
      });
      await updateBusinessProfile(business.id, uid, { marketplaceListed: true });
      setShowPublishForm(false);
      setFeedback('Your business listing is now live on the TownshipBiz local marketplace.');
    } finally {
      setPublishing(false);
    }
  };

  const openListing = async (listing: MarketplaceListing) => {
    setSelectedListing(listing);
    setFeedback(null);
    try {
      const revs = await fetchListingReviews(listing.id);
      setReviews(
        revs.map((r) => ({
          id: String(r.id),
          authorName: String(r.authorName || 'Local customer'),
          rating: Number(r.rating || 5),
          comment: String(r.comment || ''),
        }))
      );
    } catch {
      setReviews([]);
    }
  };

  const handleSendEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListing || !enquiryMsg.trim()) return;
    await submitMarketplaceEnquiry(
      selectedListing.id,
      selectedListing.ownerUid,
      uid,
      userName,
      enquiryContact || business.email || 'In-app contact',
      enquiryMsg.trim()
    );
    setEnquiryMsg('');
    setFeedback(`Enquiry sent to ${selectedListing.businessName}.`);
  };

  const handlePostReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListing || !reviewComment.trim()) return;
    await submitListingReview(selectedListing.id, uid, userName, reviewRating, reviewComment.trim());
    setReviews((prev) => [
      { id: String(Date.now()), authorName: userName, rating: reviewRating, comment: reviewComment.trim() },
      ...prev,
    ]);
    setReviewComment('');
    setFeedback('Thank you — your review has been posted.');
  };

  const handleReport = async () => {
    if (!selectedListing || !reportReason.trim()) return;
    await reportMarketplaceListing(selectedListing.id, uid, reportReason.trim());
    setReportReason('');
    setFeedback('Listing report submitted for moderation review.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Local Business Marketplace</h1>
          <p className="mt-1 text-sm text-slate-600">
            Discover township & SME suppliers near you, or publish your own storefront. Having a
            profile here does not imply government compliance certification.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPublishForm((v) => !v)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer whitespace-nowrap"
        >
          <Store className="h-4 w-4" />
          <span>{business.marketplaceListed ? 'Update My Listing' : 'Publish My Business'}</span>
        </button>
      </div>

      {feedback && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3.5 text-sm text-teal-900">
          {feedback}
        </div>
      )}

      {showPublishForm && (
        <form onSubmit={handlePublish} className="rounded-xl border border-slate-300 bg-white p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Publish {business.name} to Marketplace</h2>
          <div>
            <label className="block text-xs font-medium text-slate-700">Business description</label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm"
            />
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-800">Add Products or Services (ZAR)</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Item / service name"
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                placeholder="Price (ZAR)"
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm font-mono"
              />
              <input
                type="text"
                value={productDesc}
                onChange={(e) => setProductDesc(e.target.value)}
                placeholder="Short description"
                className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
              />
              <button
                type="button"
                onClick={handleAddProduct}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
              >
                Add Item
              </button>
            </div>
            {products.length > 0 && (
              <ul className="divide-y divide-slate-100 text-xs">
                {products.map((p, i) => (
                  <li key={i} className="flex justify-between py-1.5">
                    <span>
                      <strong>{p.name}</strong> — {p.description}
                    </span>
                    <span className="font-mono font-semibold">{formatZAR(p.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={shareCipcStatus}
              onChange={(e) => setShareCipcStatus(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-700"
            />
            <span>
              Optionally display self-reported registration / VAT status (clearly marked as not government
              certification)
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPublishForm(false)}
              className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={publishing}
              className="min-h-[44px] rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer"
            >
              {publishing ? 'Publishing...' : 'Publish Listing'}
            </button>
          </div>
        </form>
      )}

      {/* Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business name, township, suburb, or product..."
            className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={provinceFilter}
          onChange={(e) => setProvinceFilter(e.target.value)}
          className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="all">All Provinces</option>
          <option value="Gauteng">Gauteng</option>
          <option value="Western Cape">Western Cape</option>
          <option value="KwaZulu-Natal">KwaZulu-Natal</option>
          <option value="Eastern Cape">Eastern Cape</option>
          <option value="Limpopo">Limpopo</option>
          <option value="Mpumalanga">Mpumalanga</option>
          <option value="North West">North West</option>
          <option value="Free State">Free State</option>
          <option value="Northern Cape">Northern Cape</option>
        </select>
      </div>

      {/* Directory + Detail Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white flex flex-col"
            >
              <div className="aspect-[4/3] w-full bg-slate-100 overflow-hidden flex items-center justify-center">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.businessName}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <Store className="h-8 w-8 mb-1" />
                    <span className="text-xs font-medium">{item.businessName}</span>
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <p className="text-xs text-slate-500">
                    {item.category} · <MapPin className="inline h-3 w-3" /> {item.location}
                  </p>
                  <h2 className="mt-1 text-base font-bold text-slate-900">{item.businessName}</h2>
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">{item.description}</p>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                    <span className="font-mono tabular-nums">{item.ratingAvg.toFixed(1)}</span>
                    <span className="text-slate-400">({item.reviewCount})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openListing(item)}
                    className="min-h-[38px] rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    View & Enquire
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Selected Listing Panel */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 h-fit">
          {!selectedListing ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Select a business card to inspect products & pricing, send a customer enquiry, leave a
              review, or report an issue.
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-slate-500">
                  {selectedListing.category} · {selectedListing.location}, {selectedListing.province}
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  {selectedListing.businessName}
                </h2>
                <p className="mt-2 text-sm text-slate-700">{selectedListing.description}</p>
                {selectedListing.contactPhone && (
                  <p className="mt-2 text-xs font-mono text-slate-600">
                    Tel: {selectedListing.contactPhone}
                  </p>
                )}
              </div>

              {selectedListing.products.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-800 mb-2">Products & Pricing</p>
                  <div className="divide-y divide-slate-100 text-xs">
                    {selectedListing.products.map((p, idx) => (
                      <div key={idx} className="flex justify-between py-2 gap-3">
                        <div>
                          <p className="font-medium text-slate-900">{p.name}</p>
                          <p className="text-slate-500">{p.description}</p>
                        </div>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {formatZAR(p.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Enquiry Form */}
              <form onSubmit={handleSendEnquiry} className="border-t border-slate-100 pt-4 space-y-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <MessageSquare className="h-3.5 w-3.5 text-teal-700" />
                  <span>Send Customer Enquiry</span>
                </p>
                <input
                  type="text"
                  required
                  value={enquiryContact}
                  onChange={(e) => setEnquiryContact(e.target.value)}
                  placeholder="Your phone / WhatsApp or email"
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 text-xs"
                />
                <textarea
                  rows={2}
                  required
                  value={enquiryMsg}
                  onChange={(e) => setEnquiryMsg(e.target.value)}
                  placeholder="Ask about stock availability, bulk pricing, or hours..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
                />
                <button
                  type="submit"
                  className="min-h-[40px] w-full rounded-lg bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 cursor-pointer"
                >
                  Send Enquiry
                </button>
              </form>

              {/* Reviews */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-800">Customer Reviews</p>
                {reviews.length === 0 ? (
                  <p className="text-xs text-slate-500">No reviews yet. Be the first to review.</p>
                ) : (
                  <div className="space-y-2 text-xs max-h-40 overflow-y-auto">
                    {reviews.map((r) => (
                      <div key={r.id} className="border-b border-slate-100 pb-2">
                        <p className="font-medium text-slate-900">
                          {r.authorName} · {r.rating}/5 stars
                        </p>
                        <p className="text-slate-600">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handlePostReview} className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <select
                      value={reviewRating}
                      onChange={(e) => setReviewRating(Number(e.target.value))}
                      className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2 text-xs"
                    >
                      {[5, 4, 3, 2, 1].map((n) => (
                        <option key={n} value={n}>
                          {n} Stars
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Write a helpful review..."
                      className="min-h-[38px] flex-1 rounded-lg border border-slate-300 px-3 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="min-h-[38px] rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    Post Review
                  </button>
                </form>
              </div>

              {/* Report Moderation */}
              <div className="border-t border-slate-100 pt-3 flex items-center gap-2">
                <Flag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Report misleading or unsafe listing..."
                  className="min-h-[36px] flex-1 rounded-lg border border-slate-200 px-2.5 text-xs"
                />
                <button
                  type="button"
                  onClick={handleReport}
                  className="min-h-[36px] rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 hover:text-red-700 cursor-pointer"
                >
                  Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
