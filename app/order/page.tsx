'use client'

// Public, param-driven pre-configured checkout — /order?modules=ghg,supply&tier=professional&ref=<token>
//
// STAGE 1b: renders the pre-configured order and the CARD path only (total ≤ $10k), reusing the
// EXISTING startCheckout money funnel (which bounces logged-out buyers through signup→resume→Stripe).
// The QUOTE path (>$10k or GHG Advisory) shows a placeholder — Stage 2 builds the real quote form.
//
// ⚠️ LIVE MONEY: the card-path startCheckout call is byte-identical to the pricing page's. We NEVER
// call startCheckout when the cart requires a quote/invoice (it 400s by design).

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  LEGACY_PRICING_PAGE_ID,
  cartQuote,
  GHG_TIERS,
  FLAT_MODULE_PRICES,
  type Tier,
  type GhgTier,
  type ModuleKey,
} from '../../lib/pricing'
import { startCheckout } from '../../lib/checkout'
import ConsentForm, { type ConsentPayload } from '../components/ConsentForm'

const GRAD = 'var(--color-brand)'

const MODULE_LABELS: Record<ModuleKey, string> = {
  'ghg': 'GHG Emissions Inventory',
  'cbam': 'CBAM (Carbon Border Adjustment Mechanism)',
  'climate-risk': 'Climate Risk',
  'double-materiality': 'Materiality Assessment',
  'supply-chain': 'Supply Chain / Scope 3',
  'deals': 'Deals & Investment',
  'ai-governance': 'AI Governance',
  'people': 'People & Workforce',
  'cyber': 'Cyber Governance',
}
const TIER_LABEL: Record<Tier, string> = { starter: 'Essentials', professional: 'Professional', advisory: 'Advisory' }

const usd = (n: number) => `$${n.toLocaleString()}`

const orderLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', display: 'block', marginBottom: 4, marginTop: 12 }
const orderInput: React.CSSProperties = { width: '100%', fontSize: 13, padding: '9px 12px', border: '1px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', color: '#0d0d0d' }}>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1rem 1.5rem' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {/* WORDMARK — stays 'Georgia, serif', deliberately not var(--font-display).
          A logotype is a brand asset, not a heading: changing its face changes the mark.
          It also has to match the same wordmark in email HTML, which cannot resolve a
          custom property or rely on a web font loading. See app/components/headingStyles.ts. */}
          <a href="/" style={{ textDecoration: 'none', fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, background: GRAD }}>ThemisIQ</a>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)' }}>Secure checkout</span>
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>{children}</div>
    </div>
  )
}

function OrderInner() {
  const searchParams = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
  // Quote-request form (>$10k / Advisory path) — email-only, no payment.
  const [q, setQ] = useState({ name: '', email: '', company: '', phone: '', hp: '' }) // hp = honeypot (bots fill it)
  const [quoteStatus, setQuoteStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  // ── Params → canonical keys + validated tier ──────────────────────────────────
  const rawTier = searchParams.get('tier')
  const tier: Tier = (rawTier === 'starter' || rawTier === 'professional' || rawTier === 'advisory') ? rawTier : 'starter'
  const ref = searchParams.get('ref') // attribution token — preserved, no logic this stage

  const keys = Array.from(new Set(
    (searchParams.get('modules') ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)
      .map(id => LEGACY_PRICING_PAGE_ID[id]).filter(Boolean)
  )) as ModuleKey[]

  // ── Empty / invalid state ─────────────────────────────────────────────────────
  if (keys.length === 0) {
    return (
      <Shell>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 400, marginBottom: 10 }}>Nothing selected yet</div>
          <div style={{ fontSize: 14, color: '#555553', lineHeight: 1.7, marginBottom: 20, maxWidth: 420, margin: '0 auto 20px' }}>
            This order link doesn&rsquo;t include any modules. Choose what you need on the pricing page to get started.
          </div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '12px 26px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Configure your plan →</a>
        </div>
      </Shell>
    )
  }

  // ── Quote (authoritative price — same fn the checkout API charges from) ────────
  const quote = cartQuote({ modules: keys, ghgTier: tier as GhgTier })
  const cardEligible = !quote.requiresQuote && !quote.requiresInvoice

  // Line items (list prices). GHG at the tier price; others flat. null = Advisory (quote).
  const lineItems = keys.map(k => ({
    key: k,
    label: MODULE_LABELS[k] ?? k,
    detail: k === 'ghg' ? `${TIER_LABEL[tier]}${GHG_TIERS[tier].locationAllowance != null ? ` · up to ${GHG_TIERS[tier].locationAllowance} locations` : ' · uncapped'}` : 'Annual',
    price: k === 'ghg' ? GHG_TIERS[tier].priceUSD : FLAT_MODULE_PRICES[k as Exclude<ModuleKey, 'ghg'>],
  }))
  const subtotal = lineItems.reduce((s, li) => s + (li.price ?? 0), 0)
  const discount = !quote.requiresQuote && subtotal > quote.totalUSD ? subtotal - quote.totalUSD : 0

  // Card path: EXACT shape the pricing page uses. Hard guard: never on the quote path.
  const pay = async (payload: ConsentPayload) => {
    if (!cardEligible) return
    setSubmitting(true)
    try {
      await startCheckout({ tier, moduleKeys: keys, ...payload })
    } finally {
      setSubmitting(false) // on success startCheckout navigates away; on failure it alerts + we re-enable
    }
  }

  // Quote path: email-only request (no Stripe). Enabled once name + valid email + company filled.
  const qReady = !!q.name.trim() && q.email.includes('@') && !!q.company.trim()
  const submitQuote = async () => {
    if (!qReady || quoteStatus === 'sending') return
    setQuoteStatus('sending')
    try {
      const res = await fetch('/api/order/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: { name: q.name.trim(), email: q.email.trim(), company: q.company.trim(), phone: q.phone.trim() || undefined, hp: q.hp || undefined },
          order: { modules: keys, tier, totalUSD: quote.totalUSD, ref: ref ?? undefined },
        }),
      })
      setQuoteStatus(res.ok ? 'done' : 'error')
    } catch {
      setQuoteStatus('error')
    }
  }

  return (
    <Shell>
      <div data-ref={ref ?? undefined}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 6 }}>Pre-configured order</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.7rem, 5vw, 2.3rem)', fontWeight: 400, lineHeight: 1.15, margin: '0 0 20px' }}>Your ThemisIQ order</h1>

        {/* Order summary */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
          {lineItems.map((li, i) => (
            <div key={li.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '10px 0', borderBottom: i < lineItems.length - 1 ? '0.5px solid #f3f4f6' : 'none' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d' }}>{li.label}</div>
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>{li.detail}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', flexShrink: 0 }}>{li.price != null ? `${usd(li.price)}/yr` : 'Custom quote'}</div>
            </div>
          ))}

          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingTop: 12, fontSize: 13, color: '#0F6E56' }}>
              <span>Multi-module discount</span>
              <span>−{usd(discount)}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '0.5px solid #e8e7e4' }}>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555553' }}>Total</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d' }}>
              {quote.requiresQuote ? 'Custom quote' : `${usd(quote.totalUSD)}/yr`}
            </span>
          </div>
        </div>

        {/* Path decision */}
        {cardEligible ? (
          <ConsentForm
            onSubmit={pay}
            submitting={submitting}
            submitLabel="Continue to secure payment →"
            title="Confirm your purchase"
            subtitle="ThemisIQ sells to businesses only. Confirm the details below to continue to secure payment."
          />
        ) : (
          // QUOTE path (>$10k or GHG Advisory) — placeholder this stage. NEVER routes to card checkout.
          <div style={{ background: 'var(--color-brand-wash)', border: '0.5px solid color-mix(in srgb, var(--color-brand) 20%, transparent)', borderRadius: 14, padding: '1.75rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>This configuration needs a custom quote</div>
            <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: 16 }}>
              {quote.requiresQuote
                ? 'GHG Advisory (uncapped locations) is tailored to your footprint, so it’s priced individually.'
                : 'Orders above $10,000 are completed by invoice rather than card.'} Our team will prepare a quote and walk you through next steps.
            </div>

            {quoteStatus === 'done' ? (
              <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.25)', borderRadius: 10, padding: '1.25rem' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F6E56', marginBottom: 4 }}>Thanks — we&rsquo;ve received your request.</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7 }}>Our team will prepare your quote and follow up at <strong>{q.email}</strong>.</div>
              </div>
            ) : (
              <div>
                <label style={orderLabel}>Your name</label>
                <input value={q.name} onChange={e => setQ(v => ({ ...v, name: e.target.value }))} placeholder="Full name" style={orderInput} />
                <label style={orderLabel}>Work email</label>
                <input value={q.email} onChange={e => setQ(v => ({ ...v, email: e.target.value }))} placeholder="you@company.com" type="email" style={orderInput} />
                <label style={orderLabel}>Company</label>
                <input value={q.company} onChange={e => setQ(v => ({ ...v, company: e.target.value }))} placeholder="Acme Industries Inc." style={orderInput} />
                <label style={orderLabel}>Phone <span style={{ color: 'var(--color-ink-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input value={q.phone} onChange={e => setQ(v => ({ ...v, phone: e.target.value }))} placeholder="+1 555 000 0000" style={orderInput} />
                {/* Honeypot — visually hidden; real users never fill it, bots do → server silently drops. */}
                <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', left: '-9999px' }}>
                  <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={q.hp} onChange={e => setQ(v => ({ ...v, hp: e.target.value }))} /></label>
                </div>

                {quoteStatus === 'error' && (
                  <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 12 }}>Something went wrong sending your request. Please try again.</div>
                )}

                <button
                  onClick={submitQuote}
                  disabled={!qReady || quoteStatus === 'sending'}
                  style={{ marginTop: 18, fontSize: 14, fontWeight: 600, padding: '12px 26px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: (qReady && quoteStatus !== 'sending') ? 'pointer' : 'not-allowed', opacity: (qReady && quoteStatus !== 'sending') ? 1 : 0.4 }}
                >
                  {quoteStatus === 'sending' ? 'Sending…' : 'Request your quote'}
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6, marginTop: 16, textAlign: 'center' }}>
          Prices in USD. Payment is processed securely by Stripe. You&rsquo;ll create or sign in to your ThemisIQ account as part of checkout.
        </div>
      </div>
    </Shell>
  )
}

export default function OrderPage() {
  return (
    <Suspense fallback={<Shell><div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>Loading your order…</div></Shell>}>
      <OrderInner />
    </Suspense>
  )
}
