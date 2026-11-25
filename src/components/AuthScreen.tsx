import React, { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  getIdToken,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { ArrowRight, CheckCircle2, FileText, ShieldCheck, Store } from 'lucide-react';
import { canRetryGoogleSignInWithRedirect, isEmailVerifiedUser } from '../lib/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

const PREVIEW_BUSINESSES = [
  {
    name: "Thando's Community Market",
    category: 'Spaza & Grocery Retail · Soweto, Gauteng',
    image: '/src/assets/images/marketplace_spaza_fresh_1794560924316.jpg',
    description: 'Fresh produce, daily bread, maize meal, and household essentials.',
  },
  {
    name: 'Kasi Gourmet Kitchen',
    category: 'Food Vendor · Khayelitsha, Western Cape',
    image: '/src/assets/images/marketplace_kota_kitchen_1794560924995.jpg',
    description: 'Gourmet kotas, bunny chow, and braai platters prepared fresh daily.',
  },
  {
    name: 'Legacy Grooming Studio',
    category: 'Hair Salon & Barber · Orlando West',
    image: '/src/assets/images/marketplace_hair_studio_1794560924457.jpg',
    description: 'Clean fades, braiding, and hair care services.',
  },
  {
    name: 'Naledi Shweshwe Atelier',
    category: 'Clothing & Tailoring · Umlazi, KwaZulu-Natal',
    image: '/src/assets/images/marketplace_tailor_craft_1794560924944.jpg',
    description: 'Custom shweshwe garments, alterations, and school uniforms.',
  },
];

let googleRedirectResult: ReturnType<typeof getRedirectResult> | undefined;

function getGoogleRedirectResult() {
  googleRedirectResult ??= getRedirectResult(auth);
  return googleRedirectResult;
}

interface AuthScreenProps {
  authError?: string | null;
  onEmailVerified: (user: User) => Promise<void>;
}

export function AuthScreen({ authError, onEmailVerified }: AuthScreenProps) {
  const [authMode, setAuthMode] = useState<'google' | 'login' | 'register' | 'reset'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [popiaAccepted, setPopiaAccepted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [canUseGoogleRedirect, setCanUseGoogleRedirect] = useState(false);
  const googleSignInInProgress = useRef(false);
  const pendingVerificationUser = isEmailVerifiedUser(auth.currentUser) ? null : auth.currentUser;

  useEffect(() => {
    let active = true;
    getGoogleRedirectResult().catch((err: unknown) => {
      if (!active) return;
      const message = err instanceof Error ? err.message : 'Google redirect sign-in failed.';
      const code =
        err instanceof Error && 'code' in err && typeof err.code === 'string' ? err.code : undefined;
      setError(
        code === 'auth/unauthorized-domain'
          ? `Google sign-in is not enabled for this app domain. Add the current hostname to Firebase Authentication > Settings > Authorized domains. (${message})`
          : `Google redirect sign-in failed${code ? ` (${code})` : ''}: ${message}`
      );
      setCanUseGoogleRedirect(canRetryGoogleSignInWithRedirect(code));
    });
    return () => {
      active = false;
    };
  }, []);

  const handleResendVerification = async () => {
    const user = auth.currentUser;
    if (!user || isEmailVerifiedUser(user)) return;
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await sendEmailVerification(user);
      setInfoMessage(`A verification link has been sent to ${user.email || 'your email address'}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send the verification email.';
      setError(`Could not send the verification email. ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await reload(user);
      await getIdToken(user, true);
      if (!isEmailVerifiedUser(user)) {
        setInfoMessage('Your email is not verified yet. Open the link in your inbox, then check again.');
        return;
      }
      await onEmailVerified(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not refresh your verification status.';
      setError(`Could not refresh your verification status. ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    try {
      await signOut(auth);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not sign out.';
      setError(msg);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleSignInInProgress.current) return;
    if (!popiaAccepted) {
      setError('Please acknowledge the POPIA privacy and data minimisation notice to continue.');
      return;
    }
    googleSignInInProgress.current = true;
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err && typeof err.code === 'string' ? err.code : undefined;
      if (canRetryGoogleSignInWithRedirect(code)) {
        setError(
          code === 'auth/popup-closed-by-user'
            ? 'The Google popup closed before TownshipBiz received a sign-in result.'
            : 'Google popup sign-in could not complete in this browser.'
        );
        setCanUseGoogleRedirect(true);
      } else {
        const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
        setError(
          code === 'auth/unauthorized-domain'
            ? `Google sign-in is not enabled for this app domain. Add the current hostname to Firebase Authentication > Settings > Authorized domains. (${msg})`
            : `Google sign-in failed${code ? ` (${code})` : ''}: ${msg}`
        );
      }
    } finally {
      googleSignInInProgress.current = false;
      setLoading(false);
    }
  };

  const handleGoogleRedirect = async () => {
    if (googleSignInInProgress.current) return;
    googleSignInInProgress.current = true;
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await signInWithRedirect(auth, googleAuthProvider);
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err && typeof err.code === 'string' ? err.code : undefined;
      const msg = err instanceof Error ? err.message : 'Google redirect sign-in failed.';
      setError(`Google redirect sign-in failed${code ? ` (${code})` : ''}: ${msg}`);
    } finally {
      googleSignInInProgress.current = false;
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!popiaAccepted && authMode !== 'reset') {
      setError('Please acknowledge the POPIA privacy notice to continue.');
      return;
    }
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else if (authMode === 'register') {
        if (password.length < 10) {
          throw new Error('Password must be at least 10 characters long.');
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        try {
          await sendEmailVerification(cred.user);
          setInfoMessage(`A verification link has been sent to ${cred.user.email || email.trim()}.`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Email delivery failed.';
          setError(`Your account was created, but the verification email could not be sent. ${msg}`);
        }
      } else if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        setInfoMessage('Password reset instructions have been sent to your email address.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication request failed.';
      if (msg.includes('operation-not-allowed')) {
        setError(
          'Email/password sign-in is not yet enabled in Firebase Console (Authentication > Sign-in method). Please use Continue with Google for instant access.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-4 sm:px-6 lg:px-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            TownshipBiz
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Platform
            </a>
            <a href="#compliance" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              SA Compliance
            </a>
            <a href="#marketplace-preview" className="hover:text-slate-900 whitespace-nowrap shrink-0">
              Local Marketplace
            </a>
          </nav>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            Sign In
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center">
            <p className="text-xs font-medium text-teal-800">
              South African SMEs · Informal Traders · Spaza Shops · Service Providers
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl text-balance">
              Run your business, scan receipts, and stay compliant in one place.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
              Track every Rand coming in and going out, snap till slips for review, store permits securely,
              check SARS, CIPC, and municipal requirements, and list your shop for local customers.
            </p>

            <div id="features" className="mt-8 grid grid-cols-1 gap-6 border-t border-slate-200 pt-6 sm:grid-cols-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FileText className="h-4 w-4 text-teal-700" />
                  <span>Receipt OCR & ZAR Ledger</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">
                  Extract till-slip totals, spot duplicate slips, and confirm before saving.
                </p>
              </div>
              <div id="compliance">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-teal-700" />
                  <span>SA Compliance Engine</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">
                  Tailored CIPC, SARS, UIF, COIDA, R638 food, and municipal rules.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Store className="h-4 w-4 text-teal-700" />
                  <span>Local Marketplace</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">
                  Reach township and neighbourhood customers with product listings and enquiries.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="h-full rounded-xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Access your business workspace</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Business data is strictly isolated per owner account and protected under POPIA principles.
                </p>

                {pendingVerificationUser ? (
                  <div className="mt-6 space-y-4">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                      <h3 className="font-semibold">Verify your email to continue</h3>
                      <p className="mt-1">
                        TownshipBiz sent a verification link to {pendingVerificationUser.email || 'your email address'}.
                        Verify your address before creating a profile or accessing your business workspace.
                      </p>
                    </div>
                    {authError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {authError}
                      </div>
                    )}
                    {error && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {error}
                      </div>
                    )}
                    {infoMessage && (
                      <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                        {infoMessage}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleRefreshVerification}
                      disabled={loading}
                      className="min-h-[48px] w-full rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 cursor-pointer disabled:opacity-60"
                    >
                      {loading ? 'Checking verification...' : "I've verified my email"}
                    </button>
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={loading}
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-60"
                    >
                      Resend verification email
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={loading}
                      className="w-full py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer disabled:opacity-60"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <>
                    {authError && (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {authError}
                      </div>
                    )}
                    <div className="mt-5 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('google');
                          setError(null);
                        }}
                        className={`min-h-[40px] rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          authMode === 'google'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Google
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('login');
                          setError(null);
                        }}
                        className={`min-h-[40px] rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          authMode === 'login'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Email Login
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('register');
                          setError(null);
                        }}
                        className={`min-h-[40px] rounded-md px-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          authMode === 'register'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Register
                      </button>
                    </div>

                    {error && (
                      <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {error}
                      </div>
                    )}
                    {canUseGoogleRedirect && (
                      <button
                        type="button"
                        onClick={handleGoogleRedirect}
                        disabled={loading}
                        className="mt-3 min-h-[44px] w-full rounded-lg border border-teal-700 px-5 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-50 cursor-pointer disabled:opacity-60"
                      >
                        Continue with Google using a page redirect
                      </button>
                    )}
                    {infoMessage && (
                      <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                        {infoMessage}
                      </div>
                    )}

                    {authMode === 'google' ? (
                      <div className="mt-6 space-y-4">
                        <button
                          type="button"
                          onClick={handleGoogleSignIn}
                          disabled={loading}
                          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <span>{loading ? 'Signing in...' : 'Continue with Google'}</span>
                          <ArrowRight className="h-4 w-4" />
                        </button>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Recommended for instant access. Your session uses verified token authentication and
                          never shares private documents publicly.
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={handleEmailAuth} className="mt-5 space-y-3">
                        {authMode === 'register' && (
                          <div>
                            <label className="block text-xs font-medium text-slate-700">Your full name</label>
                            <input
                              type="text"
                              required
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              placeholder="e.g. Thabo Mokoena"
                              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-slate-700">Email address</label>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="owner@yourbusiness.co.za"
                            className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                          />
                        </div>
                        {authMode !== 'reset' && (
                          <div>
                            <label className="block text-xs font-medium text-slate-700">Password</label>
                            <input
                              type="password"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Minimum 10 characters"
                              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                            />
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={loading}
                          className="min-h-[48px] w-full rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {loading
                            ? 'Processing...'
                            : authMode === 'login'
                            ? 'Sign in with Email'
                            : authMode === 'register'
                            ? 'Create Account'
                            : 'Send Password Reset Email'}
                        </button>
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <button
                            type="button"
                            onClick={() => setAuthMode(authMode === 'reset' ? 'login' : 'reset')}
                            className="font-medium text-teal-700 hover:underline cursor-pointer"
                          >
                            {authMode === 'reset' ? 'Back to Email Login' : 'Forgot password?'}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>

              <label className="mt-6 flex items-start gap-2.5 border-t border-slate-100 pt-4 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={popiaAccepted}
                  onChange={(e) => setPopiaAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <span>
                  I consent to TownshipBiz processing only the business and contact information I submit, in
                  accordance with POPIA data-minimisation standards.
                </span>
              </label>
            </div>
          </div>
        </div>

        <section id="marketplace-preview" className="mt-14 border-t border-slate-200 pt-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Featured South African Businesses</h2>
              <p className="mt-1 text-sm text-slate-600">
                Sign in to browse the full local marketplace, send enquiries, or publish your own storefront.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              Platform profiles do not constitute government certification
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PREVIEW_BUSINESSES.map((biz) => (
              <article
                key={biz.name}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white flex flex-col"
              >
                <div className="aspect-[4/3] w-full bg-slate-100 overflow-hidden">
                  <img
                    src={biz.image}
                    alt={biz.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-500">{biz.category}</p>
                    <h3 className="mt-1 text-base font-semibold text-slate-900">{biz.name}</h3>
                    <p className="mt-1.5 text-sm text-slate-600">{biz.description}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-teal-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Active marketplace storefront</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
