import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { linkAction, safeNext, CONFIRM_LANDING } from './linkAction'
import { completeSignIn, LINK_NOT_COMPLETED, NO_LINK_HERE } from './completeSignIn'
import { authErrorText, isCaptchaError, isNoAccountForCode, CAPTCHA_FAILED } from './authErrors'
import { turnstileSiteKey, TURNSTILE_TEST_SITE_KEY } from './turnstileKey'

// LEAD1 L2 (Oct 2026): sign-in links finished in the browser, sign-in by code on /login, and Turnstile tokens on every
// auth call. The auth flows themselves need Supabase; these tests hold the decisions, the steps and the pages' wiring.

const ROOT = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const codeOnly = (src: string) => src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
const SITE = 'https://themisiq.co'

describe('linkAction: what a sign-in link carries', () => {
  it('A1: the purchase email first sign-in link (admin.generateLink, magiclink) is the fragment form', () => {
    // The webhook sets redirectTo: `${SITE_URL}/auth/callback?next=/dashboard`; Supabase appends the tokens as a fragment.
    const href = `${SITE}/auth/callback?next=/dashboard#access_token=aaa&expires_in=3600&refresh_token=bbb&token_type=bearer&type=magiclink`
    expect(linkAction(href)).toEqual({ kind: 'fragment' })
    expect(safeNext(new URL(href).searchParams.get('next'))).toBe('/dashboard')
  })

  it('A2: a sign-up confirmation is the fragment form too', () => {
    expect(linkAction(`${SITE}/auth/callback?next=%2Fpricing#access_token=a&refresh_token=b&type=signup`)).toEqual({ kind: 'fragment' })
  })

  it('A3: the code email link is token_hash + type; an unknown type falls back to email', () => {
    expect(linkAction(`${SITE}/auth/confirm?token_hash=th1&type=email`)).toEqual({ kind: 'verify', tokenHash: 'th1', type: 'email' })
    expect(linkAction(`${SITE}/auth/confirm?token_hash=th2&type=magiclink&pending=abc`)).toEqual({ kind: 'verify', tokenHash: 'th2', type: 'magiclink' })
    expect(linkAction(`${SITE}/auth/confirm?token_hash=th3&type=bogus`)).toEqual({ kind: 'verify', tokenHash: 'th3', type: 'email' })
    expect(linkAction(`${SITE}/auth/confirm?token_hash=th4`)).toEqual({ kind: 'verify', tokenHash: 'th4', type: 'email' })
  })

  it('A4: a PKCE ?code= is the code form', () => {
    expect(linkAction(`${SITE}/auth/callback?code=c1&next=/dashboard`)).toEqual({ kind: 'code', code: 'c1' })
  })

  it('A5: an error in the query or the fragment wins, with Supabase’s description', () => {
    expect(linkAction(`${SITE}/auth/callback?error=access_denied&error_description=Email+link+is+invalid+or+has+expired`))
      .toEqual({ kind: 'error', description: 'Email link is invalid or has expired' })
    expect(linkAction(`${SITE}/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired`))
      .toEqual({ kind: 'error', description: 'Email link is invalid or has expired' })
  })

  it('A6: nothing to complete', () => {
    expect(linkAction(`${SITE}/auth/callback?next=/dashboard`)).toEqual({ kind: 'none' })
  })

  it('A7: safeNext never leaves the site', () => {
    expect(safeNext('/dashboard/ghg?start=new')).toBe('/dashboard/ghg?start=new')
    for (const bad of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'dashboard']) {
      expect(safeNext(bad as string | null)).toBe('/dashboard')
    }
  })
})

describe('completeSignIn: the steps, with a fake auth client', () => {
  const fake = (over: Partial<Record<'session' | 'verifyError' | 'exchangeError', unknown>> = {}) => ({
    getSession: vi.fn(async () => ({ data: { session: 'session' in over ? over.session : { user: 'u' } } })),
    verifyOtp: vi.fn(async () => ({ error: (over.verifyError as { message: string } | null) ?? null })),
    exchangeCodeForSession: vi.fn(async () => ({ error: (over.exchangeError as { message: string } | null) ?? null })),
  })

  it('S1: fragment → the session supabase-js stored; nothing is exchanged', async () => {
    const a = fake()
    expect(await completeSignIn(`${SITE}/auth/callback#access_token=a&refresh_token=b`, a)).toEqual({ ok: true })
    expect(a.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(a.verifyOtp).not.toHaveBeenCalled()
    const b = fake({ session: null })
    expect(await completeSignIn(`${SITE}/auth/callback#access_token=a&refresh_token=b`, b)).toEqual({ ok: false, message: LINK_NOT_COMPLETED })
  })

  it('S2: token_hash → verifyOtp in the browser', async () => {
    const a = fake()
    expect(await completeSignIn(`${SITE}/auth/confirm?token_hash=th&type=email`, a)).toEqual({ ok: true })
    expect(a.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'email' })
    const b = fake({ verifyError: { message: 'Token has expired or is invalid' } })
    expect(await completeSignIn(`${SITE}/auth/confirm?token_hash=th&type=email`, b)).toEqual({
      ok: false, message: 'This sign-in link didn’t work: Token has expired or is invalid. Sign in again, or ask for a new link.' })
  })

  it('S3: ?code= → exchangeCodeForSession in the browser', async () => {
    const a = fake()
    expect(await completeSignIn(`${SITE}/auth/callback?code=c1`, a)).toEqual({ ok: true })
    expect(a.exchangeCodeForSession).toHaveBeenCalledWith('c1')
    const b = fake({ exchangeError: { message: 'invalid flow state' } })
    expect(await completeSignIn(`${SITE}/auth/callback?code=c1`, b)).toEqual({ ok: false, message: LINK_NOT_COMPLETED })
  })

  it('S4: a link error is reported as observed; no link but already signed in goes on; no link and no session says so', async () => {
    expect(await completeSignIn(`${SITE}/auth/callback?error=x&error_description=Email+link+is+invalid+or+has+expired`, fake()))
      .toEqual({ ok: false, message: 'This sign-in link didn’t work: Email link is invalid or has expired. Sign in again, or ask for a new link.' })
    expect(await completeSignIn(`${SITE}/auth/callback`, fake())).toEqual({ ok: true })
    expect(await completeSignIn(`${SITE}/auth/callback`, fake({ session: null }))).toEqual({ ok: false, message: NO_LINK_HERE })
  })
})

describe('auth error wording', () => {
  it('E1: only the CAPTCHA refusal is reworded; every other message is shown as before', () => {
    expect(isCaptchaError({ code: 'captcha_failed', message: 'captcha protection: request disallowed' })).toBe(true)
    expect(authErrorText({ message: 'captcha verification process failed' })).toBe(CAPTCHA_FAILED)
    expect(authErrorText({ message: 'Invalid login credentials' })).toBe('Invalid login credentials')
  })

  it('E2: a code request for an address with no account is treated as sent', () => {
    expect(isNoAccountForCode({ code: 'otp_disabled', message: 'Signups not allowed for otp' })).toBe(true)
    expect(isNoAccountForCode({ message: 'Signups not allowed for otp' })).toBe(true)
    expect(isNoAccountForCode({ message: 'Email rate limit exceeded' })).toBe(false)
  })
})

describe('the pages', () => {
  it('P1: /auth/callback is a browser page; the service-role exchange is gone', () => {
    expect(existsSync(join(ROOT, 'app/auth/callback/route.ts'))).toBe(false)
    const cb = read('app/auth/callback/page.tsx')
    expect(cb).toContain("'use client'")
    expect(cb).toContain('completeSignIn(href, supabase.auth)')
    expect(codeOnly(cb)).not.toContain('createServerClient')
    expect(codeOnly(read('app/auth/confirm/page.tsx'))).not.toContain('createServerClient')
  })

  it('P2: /auth/confirm verifies and lands on the calculator', () => {
    const c = read('app/auth/confirm/page.tsx')
    expect(c).toContain('completeSignIn(window.location.href, supabase.auth)')
    // Since LEAD1 L4 it claims the held calculation first; with nothing waiting it lands here as before
    // (lib/ghg/keepResults.test.ts K13, K14).
    expect(c).toContain('window.location.replace(step.go)')
    expect(c).toContain('if (!session) return { go: CONFIRM_LANDING }')
    expect(CONFIRM_LANDING).toBe('/dashboard/ghg')
  })

  it('P3: every auth call carries a Turnstile token, and every form renders the widget', () => {
    const login = read('app/login/page.tsx')
    const signup = read('app/signup/page.tsx')
    const forgot = read('app/forgot-password/page.tsx')
    expect(login).toContain('signInWithPassword({ email, password, options: { captchaToken: spendCaptcha() } })')
    expect(login).toContain('signInWithOtp({ email, options: { shouldCreateUser: false, captchaToken: spendCaptcha() } })')
    expect(signup).toContain('captchaToken: captcha ?? undefined,')
    expect(forgot).toContain('resetPasswordForEmail(email, { redirectTo, captchaToken: captcha ?? undefined })')
    for (const src of [login, signup, forgot]) expect(src).toContain('<Turnstile onToken={setCaptcha} resetKey={captchaReset} />')
  })

  it('P4: /login signs in with a code on the same page, and never creates an account', () => {
    const login = read('app/login/page.tsx')
    expect(login).toContain("verifyOtp({ email, token: code.trim(), type: 'email' })")
    expect(login).toContain('Email me a sign-in code instead')
    expect(login).toContain('shouldCreateUser: false')
    expect(login).toContain('If an account exists for ${email}, we’ve sent it a 6-digit sign-in code. Enter it below.')
  })

  it('P5: the password paths are unchanged apart from the token and the CAPTCHA sentence', () => {
    const signup = read('app/signup/page.tsx')
    expect(signup).toContain('emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`,')
    expect(read('app/forgot-password/page.tsx')).toContain('const redirectTo = `${window.location.origin}/reset-password`')
  })

  it('P6: production uses the real key (or no widget), everything else Cloudflare\'s public test key; no secret in the browser', () => {
    expect(turnstileSiteKey('production', 'real-site-key')).toBe('real-site-key')
    expect(turnstileSiteKey('production', undefined)).toBe('')
    expect(turnstileSiteKey('preview', 'real-site-key')).toBe(TURNSTILE_TEST_SITE_KEY)
    expect(turnstileSiteKey('development', undefined)).toBe(TURNSTILE_TEST_SITE_KEY)
    expect(turnstileSiteKey(undefined, 'real-site-key')).toBe(TURNSTILE_TEST_SITE_KEY)
    // Cloudflare's documented always-pass test site key (https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
    expect(TURNSTILE_TEST_SITE_KEY).toBe('1x00000000000000000000AA')
    const t = read('app/components/Turnstile.tsx')
    expect(t).toContain('turnstileSiteKey(process.env.NEXT_PUBLIC_VERCEL_ENV, process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)')
    expect(t).not.toMatch(/process\.env\.TURNSTILE_SECRET/)
  })

  // ⚠️ THE WIDGET'S KEY IS READ WHEN app/components/Turnstile.tsx IS IMPORTED, from NEXT_PUBLIC_VERCEL_ENV and
  // NEXT_PUBLIC_TURNSTILE_SITE_KEY (L5 fix1, 5 Oct 2026). Rendered from a top-level import, this test asserted
  // whatever the machine running it had set: it passed locally and on Preview, and would have failed a Production
  // build (which runs the suite) without a site key. Each case now fixes both variables and imports the module afresh.
  describe('P6b: what the widget renders, by environment', () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
    const render = async (vercelEnv: string, siteKey: string) => {
      vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', vercelEnv)
      vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', siteKey)
      vi.resetModules()
      const { default: Turnstile } = await import('../../app/components/Turnstile')
      return renderToStaticMarkup(createElement(Turnstile, { onToken: () => {} }))
    }
    it('preview and development render the widget (with the public test key), whatever site key is set', async () => {
      expect(await render('preview', '')).toContain('data-turnstile')
      expect(await render('development', 'real-site-key')).toContain('data-turnstile')
    })
    it('production renders it with a site key, and renders nothing without one', async () => {
      expect(await render('production', 'real-site-key')).toContain('data-turnstile')
      expect(await render('production', '')).toBe('')
    })
  })
})
