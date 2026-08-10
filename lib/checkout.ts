// lib/checkout.ts
// ─────────────────────────────────────────────────────────────────────────────
// Browser helper for starting a Stripe checkout. Call startCheckout(...) from any
// "buy" button. It grabs the logged-in user's token (same supabase.auth.getSession
// pattern used across the app), calls our /api/checkout route with that token, and
// redirects the browser to Stripe's hosted payment page.
//
// Client-side only — it uses window + the browser supabase client. Do NOT import
// the server-only lib/stripe here.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase'
import type { PackId, Tier, ModuleKey, AddOnKey } from './pricing'

// What the caller passes. Use any combination:
//   { packId: 'supplier-readiness' }
//   { tier: 'starter', moduleKeys: ['ghg', 'climate-risk'] }
//   { tier: 'starter', moduleKeys: ['ghg'], addOns: ['concierge-basic'] }
export interface CheckoutSelection {
  packId?: PackId
  tier?: Tier
  moduleKeys?: ModuleKey[]
  addOns?: AddOnKey[]
  // New-model B2B consent (collected in the configurator modal; rides through the
  // resume-after-login bounce because the whole selection is stored + replayed).
  // email/ip are captured server-side at /api/checkout, NOT here.
  business?: { name: string; regNumber: string }
  purchaser?: { name: string }
  consent?: { businessCapacity: boolean; digitalAccess: boolean; dataAuthority: boolean; atISO: string; version: string }
}

export async function startCheckout(selection: CheckoutSelection): Promise<void> {
// 1) Must be logged in. If not, preserve the buy intent and send them to login,
  //    with a `next` that returns to the resume route to finish checkout after auth.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    try {
      sessionStorage.setItem('themisiq:pendingCheckout', JSON.stringify(selection))
    } catch {
      // sessionStorage unavailable (rare) — fall through; resume route also reads the URL.
    }
    const next = `/checkout?intent=${encodeURIComponent(JSON.stringify(selection))}`
    window.location.href = `/login?next=${encodeURIComponent(next)}`
    return
  }

  // 2) Call our checkout route, attaching the access token.
  let res: Response
  try {
    res = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(selection),
    })
  } catch {
    alert('Network error starting checkout. Please try again.')
    return
  }

  // 3) Handle errors from the route (e.g. "Verification requires ghg").
  if (!res.ok) {
    const { error } = await res
      .json()
      .catch(() => ({ error: 'Checkout failed. Please try again.' }))
    alert(error || 'Something went wrong starting checkout.')
    return
  }

  // 4) Redirect to Stripe's payment page.
  const { url } = await res.json()
  if (url) {
    window.location.href = url
  } else {
    alert('Could not get a checkout link. Please try again.')
  }
}
// Called by /checkout after the user returns from login. Reads the pending
// selection (from sessionStorage, falling back to a URL-encoded intent) and
// resumes checkout. Returns false if there was nothing to resume.
export async function resumePendingCheckout(intentFromUrl?: string): Promise<boolean> {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem('themisiq:pendingCheckout')
  } catch {
    /* ignore */
  }
  if (!raw && intentFromUrl) raw = intentFromUrl
  if (!raw) return false

  try {
    sessionStorage.removeItem('themisiq:pendingCheckout')
  } catch {
    /* ignore */
  }

  let selection: CheckoutSelection
  try {
    selection = JSON.parse(raw)
  } catch {
    return false
  }
  await startCheckout(selection) // now authenticated → proceeds to Stripe
  return true
}