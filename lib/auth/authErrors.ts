// lib/auth/authErrors.ts
//
// The two auth refusals that need their own wording (LEAD1 L2, Oct 2026). Every other Supabase auth error is shown as
// it always was, so the password sign-up, login and reset pages behave exactly as before.

type AuthErrorLike = { message?: string | null; code?: string | null } | null | undefined

export const CAPTCHA_FAILED = 'The security check didn’t complete. Please try again.'

/**
 * Supabase Auth's CAPTCHA protection refuses a request without a valid Turnstile token. While the protection is off,
 * the token is ignored and this never appears.
 */
export function isCaptchaError(error: AuthErrorLike): boolean {
  if (!error) return false
  return error.code === 'captcha_failed' || /captcha/i.test(error.message ?? '')
}

/**
 * Asking for a sign-in code with shouldCreateUser: false for an address with no account. Treated as sent, so the page
 * never says which addresses have accounts (the same rule /forgot-password follows).
 */
export function isNoAccountForCode(error: AuthErrorLike): boolean {
  if (!error) return false
  return error.code === 'otp_disabled' || /signups not allowed/i.test(error.message ?? '')
}

/** What an auth page shows for an error: the CAPTCHA sentence, or the message exactly as before. */
export function authErrorText(error: AuthErrorLike): string {
  return isCaptchaError(error) ? CAPTCHA_FAILED : (error?.message ?? '')
}
