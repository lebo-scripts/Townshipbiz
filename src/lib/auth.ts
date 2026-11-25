export function isEmailVerifiedUser(user: { emailVerified: boolean } | null): boolean {
  return user?.emailVerified === true;
}

export function canRetryGoogleSignInWithRedirect(code: string | undefined): boolean {
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/popup-blocked' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/web-storage-unsupported'
  );
}
