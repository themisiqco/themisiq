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
//   { tier: 'starter', moduleKeys: ['ghg'], addOns: ['verification'] }
export interface CheckoutSelection {
  packId?: PackId
  tier?: Tier
  moduleKeys?: ModuleKey[]
  addOns?: AddOnKey[]
}

export async function startCheckout(selection: CheckoutSelection): Promise<void> {
  // 1) Must be logged in (the route requires it; this is a friendlier early check).
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    alert('Please sign in to continue to checkout.')
    // Adjust this path if your login route differs (e.g. '/auth' or '/signup').
    window.location.href = '/login'
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
