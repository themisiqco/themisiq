// lib/auth/linkAction.ts
//
// WHAT A SIGN-IN LINK CARRIES, decided in one place (LEAD1 L2, Oct 2026). Pure: takes the URL, returns what the page
// has to do. Used by /auth/callback (sign-up confirmations, the purchase email's first sign-in link, password
// sign-ins that come back through Supabase) and /auth/confirm (the sign-in code email's link).
//
// WHY IT EXISTS. app/auth/callback was a route handler that exchanged ?code= with createServerClient(), a
// SERVICE-ROLE client (lib/supabase.ts). The session that made lived on the server and never reached the browser,
// where the app keeps its session (localStorage). Sign-ins worked only because Supabase's links put the tokens in the
// URL FRAGMENT, which the redirect preserved and supabase-js picked up on the next page: the exchange did nothing.
// The page now handles every shape in the browser, where the session belongs.
//
// The shapes, in the order they are checked:
//   error     ?error= / #error= (with error_description): Supabase refused the link (expired, used, invalid)
//   fragment  #access_token=…: supabase-js stores the session itself when the client loads (detectSessionInUrl);
//             the purchase email's link (admin.generateLink, magiclink) and sign-up confirmations arrive this way
//   verify    ?token_hash=…&type=…: the sign-in code email's link; verifyOtp({ token_hash, type }) in the browser
//   code      ?code=…: a PKCE code; exchangeCodeForSession in the browser (only this browser holds the verifier)
//   none      nothing to complete

export const OTP_LINK_TYPES = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change'] as const
export type OtpLinkType = (typeof OTP_LINK_TYPES)[number]

export type LinkAction =
  | { kind: 'error'; description: string }
  | { kind: 'fragment' }
  | { kind: 'verify'; tokenHash: string; type: OtpLinkType }
  | { kind: 'code'; code: string }
  | { kind: 'none' }

/** Where the sign-in code email's link lands once verified (/auth/confirm). L3 adds the claim of the free calculation. */
export const CONFIRM_LANDING = '/dashboard/ghg'

/** A same-site path to go to afterwards, or the fallback. Refuses absolute URLs and protocol-relative ones (//x). */
export function safeNext(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}

export function linkAction(href: string): LinkAction {
  const url = new URL(href)
  const query = url.searchParams
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)

  const err = query.get('error') ?? hash.get('error')
  if (err) {
    const description = query.get('error_description') ?? hash.get('error_description') ?? err
    return { kind: 'error', description: description.replace(/\+/g, ' ') }
  }
  if (hash.get('access_token')) return { kind: 'fragment' }

  const tokenHash = query.get('token_hash')
  if (tokenHash) {
    const raw = query.get('type') ?? 'email'
    const type = (OTP_LINK_TYPES as readonly string[]).includes(raw) ? (raw as OtpLinkType) : 'email'
    return { kind: 'verify', tokenHash, type }
  }

  const code = query.get('code')
  if (code) return { kind: 'code', code }

  return { kind: 'none' }
}
