// lib/auth/completeSignIn.ts
//
// Finishing a sign-in from a link, in the browser (LEAD1 L2, Oct 2026). Takes the auth client as an argument, so the
// pages pass supabase.auth and the tests pass a fake: what is decided is in linkAction(), what is done is here, and
// both are tested without a network.
//
// Every failure says what was observed, not a guess at why (CLAUDE.md: an empty result is reported as one).

import { linkAction } from './linkAction'

type AuthLike = {
  getSession(): Promise<{ data: { session: unknown | null } }>
  verifyOtp(params: { token_hash: string; type: string }): Promise<{ error: { message: string } | null }>
  exchangeCodeForSession(code: string): Promise<{ error: { message: string } | null }>
}

export type SignInResult = { ok: true } | { ok: false; message: string }

export const LINK_NOT_COMPLETED =
  'We couldn’t finish signing you in from this link. Sign in again, or ask for a new link.'
export const NO_LINK_HERE =
  'This page finishes signing in from an email link, and there is no link to finish here. Sign in instead.'

export async function completeSignIn(href: string, auth: AuthLike): Promise<SignInResult> {
  const action = linkAction(href)
  switch (action.kind) {
    case 'error':
      return { ok: false, message: `This sign-in link didn’t work: ${action.description}. Sign in again, or ask for a new link.` }
    case 'fragment': {
      // supabase-js reads the fragment while the client initialises; getSession waits for that.
      const { data } = await auth.getSession()
      return data.session ? { ok: true } : { ok: false, message: LINK_NOT_COMPLETED }
    }
    case 'verify': {
      const { error } = await auth.verifyOtp({ token_hash: action.tokenHash, type: action.type })
      return error ? { ok: false, message: `This sign-in link didn’t work: ${error.message}. Sign in again, or ask for a new link.` } : { ok: true }
    }
    case 'code': {
      const { error } = await auth.exchangeCodeForSession(action.code)
      return error ? { ok: false, message: LINK_NOT_COMPLETED } : { ok: true }
    }
    case 'none': {
      // Someone landing here already signed in (a reload, a second click) is simply sent on.
      const { data } = await auth.getSession()
      return data.session ? { ok: true } : { ok: false, message: NO_LINK_HERE }
    }
  }
}
