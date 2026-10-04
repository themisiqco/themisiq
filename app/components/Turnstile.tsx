'use client'

// app/components/Turnstile.tsx
//
// Cloudflare Turnstile for the auth pages (LEAD1 L2, Oct 2026). It produces the captchaToken that Supabase Auth's
// CAPTCHA protection requires on signUp, signInWithPassword, signInWithOtp and resetPasswordForEmail. The pages pass
// the token in those calls' options.
//
// WHICH KEY: production uses NEXT_PUBLIC_TURNSTILE_SITE_KEY; previews and local development use Cloudflare's public
// always-pass test key (lib/auth/turnstileKey.ts), because the real widget allows only themisiq.co and www.themisiq.co.
//
// ⚠️ IT NEVER BLOCKS A FORM, SO DEPLOYING IT FIRST BREAKS NOTHING.
//   - Production with no site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY unset): renders nothing, the token stays null, and
//     every call goes out exactly as before.
//   - Site key set, Supabase CAPTCHA still OFF: Supabase ignores the token.
//   - Site key set, CAPTCHA ON: the token is required; without it Supabase refuses and the page says
//     "The security check didn’t complete. Please try again." (lib/auth/authErrors.ts).
//   Submit buttons are not disabled while the widget loads: a blocked script must not lock anyone out while the
//   protection is off.
//
// A token is single-use, so a page bumps `resetKey` after each auth call and the widget issues a fresh one.
// The secret key is never in the browser: it lives in the Supabase dashboard (and TURNSTILE_SECRET_KEY for /pending, L3).

import { useEffect, useRef } from 'react'
import { turnstileSiteKey } from '../../lib/auth/turnstileKey'

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string
      reset(widgetId?: string): void
      remove(widgetId: string): void
    }
  }
}

export const TURNSTILE_SITE_KEY = turnstileSiteKey(process.env.NEXT_PUBLIC_VERCEL_ENV, process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptPromise: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT_SRC
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => { scriptPromise = null; reject(new Error('Turnstile script did not load')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

export default function Turnstile({ onToken, resetKey = 0 }: { onToken: (token: string | null) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  useEffect(() => { onTokenRef.current = onToken }, [onToken])

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile || widgetId.current) return
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(err => console.error('[turnstile]', err))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  useEffect(() => {
    if (resetKey === 0 || !widgetId.current || !window.turnstile) return
    onTokenRef.current(null)
    window.turnstile.reset(widgetId.current)
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={box} data-turnstile style={{ minHeight: 65 }} />
}
