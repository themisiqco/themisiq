// app/api/webhooks/stripe/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Stripe calls this route after a payment. It is the ONLY thing that unlocks
// modules — never the browser, never the success page (which can be faked).
//
// Flow:
//   1. Verify the request is genuinely from Stripe (signature check).
//   2. On a successful payment, read the metadata we attached at checkout
//      (user_id + comma-separated entitlement keys).
//   3. Write those unlocks into the `entitlements` table via the admin client.
//
// Handles both Checkout payments (checkout.session.completed) and, for the future
// invoice flow, invoice.paid — both carry the same metadata shape.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '../../../../lib/stripe'
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin'
import { entitlementTerm } from '../../../../lib/entitlementTerm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

// ── Invoice-path login email (Resend) ─────────────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL     = process.env.RESEND_FROM_EMAIL || 'noreply@themisiq.co'
const SITE_URL       = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.themisiq.co'

// Same Resend fetch helper used by the transactional routes (replicated).
async function sendEmail(to: string, subject: string, html: string, text?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `ThemisIQ <${FROM_EMAIL}>`, to: [to], reply_to: 'hello@themisiq.co', subject, html, ...(text ? { text } : {}) }),
  })
  return res.json()
}

// Invoice-path customers are provisioned PASSWORD-LESS (admin.createUser), so they otherwise
// can't log in. After a paid invoice, email them a one-time magic login link.
//   • Email is resolved authoritatively from metadata.user_id (getUserById) — the exact account
//     that just received the entitlements — not invoice.customer_email.
//   • DEDUP: Stripe re-delivers invoice.paid; a `login_email_sent` marker on the invoice's Stripe
//     metadata makes the send fire ONCE. On redelivery with the marker set → skip silently.
//     (Send-then-mark ordering favours delivery: if a send fails, the marker stays unset so a
//     redelivery retries; the small double-send race on concurrent redeliveries is acceptable.)
async function sendInvoiceLoginLink(stripe: Stripe, invoice: Stripe.Invoice) {
  const userId = invoice.metadata?.user_id
  if (!userId) { console.warn('[webhook] invoice.paid: no user_id in metadata; skipping login link'); return }
  if (invoice.metadata?.login_email_sent === '1') return // already sent (redelivery) → skip
  if (!invoice.id) return

  const admin = getSupabaseAdmin()

  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId)
  const email = userData?.user?.email
  if (userErr || !email) { console.warn(`[webhook] invoice.paid: no email for user ${userId}; skipping login link`); return }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${SITE_URL}/auth/callback?next=/dashboard` },
  })
  const actionLink = linkData?.properties?.action_link
  if (linkErr || !actionLink) { console.warn(`[webhook] invoice.paid: could not generate magic link for ${email}`); return }

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f7f5;"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:4px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
  <tr><td style="background:#0d0d0d;padding:24px 32px;"><span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">ThemisIQ</span></td></tr>
  <tr><td style="background:#fff;padding:32px;">
    <div style="font-family:Georgia,serif;font-size:22px;color:#0d0d0d;margin-bottom:12px;">Your ThemisIQ access is ready.</div>
    <div style="font-size:14px;color:#555553;line-height:1.7;margin-bottom:20px;">Your payment is confirmed and your modules are unlocked. Click below to log in — no password needed.</div>
    <a href="${actionLink}" style="display:inline-block;font-size:14px;font-weight:600;color:#0d0d0d;background:linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e);padding:12px 26px;border-radius:8px;text-decoration:none;">Log in to ThemisIQ →</a>
    <div style="font-size:12px;color:#888784;line-height:1.7;margin-top:20px;">This link is single-use and expires shortly. If it has expired, use &ldquo;Forgot password&rdquo; on the login page. Questions? Reach us at hello@themisiq.co.</div>
  </td></tr>
  <tr><td style="background:#0d0d0d;padding:18px 32px;"><div style="font-size:11px;color:rgba(255,255,255,0.3);">ThemisIQ · www.themisiq.co · hello@themisiq.co</div></td></tr>
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:3px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
</table>
</td></tr></table>
</body></html>`

  await sendEmail(email, 'Your ThemisIQ access is ready — log in', html, `Your ThemisIQ access is ready. Log in: ${actionLink}`)

  // Mark sent (preserve existing metadata: user_id / entitlements / …) so redeliveries skip.
  await stripe.invoices.update(invoice.id, { metadata: { ...invoice.metadata, login_email_sent: '1' } })
  console.log(`[webhook] sent invoice-path login link to ${email}`)
}

export async function POST(req: NextRequest) {
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 })
  }

  const stripe = getStripe()

  // Signature verification needs the RAW body, not parsed JSON.
  const signature = req.headers.get('stripe-signature')
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? '', webhookSecret)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        // Only act on actually-paid sessions.
        if (session.payment_status === 'paid') {
          await grantFromMetadata(session.metadata, 'stripe:checkout', {
            sessionId: session.id,
            paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
          })
        }
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        await grantFromMetadata(invoice.metadata, 'stripe:invoice')
        // Invoice-path customers have a password-less account → email them a magic login link.
        // Best-effort: a login-email failure must NEVER throw/500 the webhook (that would trigger
        // Stripe grant-retry storms). Dedup + email resolution live in the helper.
        try {
          await sendInvoiceLoginLink(stripe, invoice)
        } catch (err) {
          console.error('[webhook] invoice login-link send failed (best-effort, ignored):', err)
        }
        break
      }
      // Other event types are acknowledged but ignored.
      default:
        break
    }
  } catch (err) {
    // Returning 500 tells Stripe to retry later, so a transient DB hiccup
    // doesn't silently lose a paid customer's unlock.
    console.error('[webhook] handler error:', err)
    return NextResponse.json({ error: 'Handler error.' }, { status: 500 })
  }

  // Always 200 once handled, so Stripe stops retrying.
  return NextResponse.json({ received: true })
}

// Write the purchased entitlement keys for a user. Idempotent: re-delivery of the
// same event just re-upserts the same rows (the unique user_id+module_key
// constraint makes this safe).
//
// STILL IDEMPOTENT AFTER THE TERM COLUMNS, and that constraint is what shaped them. Stripe
// delivers at least once, so this function must be safe to run twice on one payment. The term
// rules are max()-shaped for exactly that reason: re-running yields the same term_start (the
// earlier of prior and now — prior now exists and wins) and a term_end that moves only by the
// redelivery interval. ADDING a year per delivery would give a redelivered event two years for
// one payment, which is why a repurchase does not add to the remaining term. See the ⚠️ in
// lib/entitlementTerm.ts for what would have to exist first.
//
// BOTH PROVISIONING PATHS ARRIVE HERE. Card is checkout.session.completed; invoice is
// invoice.paid, and lib/order/provision.ts only prices the order and builds the metadata string
// that this function then reads. There is no second entitlement writer in the repo, so card and
// invoice cannot disagree about the term — not by convention, but because there is one writer.
async function grantFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
  source: string,
  stripeRef?: { sessionId: string; paymentIntentId: string | null },
) {
  const userId = metadata?.user_id
  const entitlements = metadata?.entitlements
  const ghgAllowanceRaw = metadata?.ghg_location_allowance
  const ghgAllowance = ghgAllowanceRaw ? Number(ghgAllowanceRaw) : null

  if (!userId || !entitlements) {
    console.warn('[webhook] missing user_id/entitlements in metadata; nothing to grant')
    return
  }

  const keys = entitlements
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

  if (keys.length === 0) return

  const supabaseAdmin = getSupabaseAdmin()

  // Prior terms, so a term the customer has already paid for is never shortened by a repurchase.
  // THIS READ IS LOAD-BEARING AND ITS FAILURE THROWS. Without it we cannot tell a new grant from a
  // repurchase, and writing a fresh term blind would silently move an existing term_end backwards.
  // Throwing returns 500, which is Stripe's retry signal — the same contract the write below has
  // relied on since this route was written. A grant delayed by a retry is recoverable; a term
  // quietly cut short is not, and nothing downstream would ever report it.
  const { data: priorRows, error: readErr } = await supabaseAdmin
    .from('entitlements')
    .select('module_key, term_start, term_end')
    .eq('user_id', userId)
    .in('module_key', keys)

  if (readErr) {
    console.error('[webhook] failed to read prior entitlement terms:', readErr)
    throw readErr
  }

  const priorByKey = new Map(
    (priorRows ?? []).map((r) => [r.module_key as string, r as { term_start: string | null; term_end: string | null }]),
  )

  // ONE clock for the whole grant. Calling entitlementTerm with a per-row `new Date()` would give
  // the modules in a single cart term_ends seconds apart — a difference no customer could account
  // for and a support question with no good answer.
  const now = new Date()

  const rows = keys.map((module_key) => ({
    user_id: userId,
    module_key,
    source,
    location_allowance: module_key === 'ghg' ? ghgAllowance : null,
    // ONE definition of the term, shared by BOTH provisioning paths — see this function's header
    // for why that is already true. lib/entitlementTerm.ts is the only place +365 is written.
    ...entitlementTerm(now, priorByKey.get(module_key)),
  }))

  const { error } = await supabaseAdmin
    .from('entitlements')
    .upsert(rows, { onConflict: 'user_id,module_key' })

  if (error) {
    console.error('[webhook] failed to write entitlements:', error)
    throw error
  }

  console.log(`[webhook] granted [${keys.join(', ')}] to user ${userId}`)

  // Additive: persist the purchase-consent record (self-serve checkout only — present
  // when consent metadata was attached at checkout). The PRIMARY durable record is the
  // Stripe charge metadata; this is the queryable mirror. Best-effort: a failure here is
  // LOGGED, not thrown, so it never blocks the (already-committed) entitlement grant nor
  // triggers webhook-retry storms. Idempotent on stripe_session_id.
  if (metadata?.consent_version && stripeRef?.sessionId) {
    const { error: cErr } = await supabaseAdmin.from('purchase_consents').upsert(
      {
        user_id: userId,
        stripe_session_id: stripeRef.sessionId,
        payment_intent_id: stripeRef.paymentIntentId ?? null,
        business_name: metadata.business_name ?? '',
        business_reg_number: metadata.business_reg_number ?? '',
        purchaser_name: metadata.purchaser_name ?? '',
        purchaser_email: metadata.purchaser_email || null,
        ip_address: metadata.ip_address || null,
        consent_business_capacity: metadata.consent_business_capacity === 'true',
        consent_digital_access: metadata.consent_digital_access === 'true',
        consent_data_authority: metadata.consent_data_authority === 'true',
        consent_version: metadata.consent_version,
      },
      { onConflict: 'stripe_session_id' },
    )
    if (cErr) console.error('[webhook] purchase_consents write failed (consent also lives in Stripe metadata):', cErr)
    else console.log(`[webhook] recorded purchase consent for session ${stripeRef.sessionId}`)
  }
}
