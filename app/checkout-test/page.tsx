'use client'

// app/checkout-test/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY test page. Visit /checkout-test while logged in to smoke-test the
// checkout flow. Each button hits a different code path in the checkout route.
// DELETE this whole folder once checkout is verified and the real buttons are
// wired up.
// ─────────────────────────────────────────────────────────────────────────────

import { startCheckout } from '../../lib/checkout'

export default function CheckoutTestPage() {
  const box: React.CSSProperties = {
    maxWidth: 560,
    margin: '4rem auto',
    fontFamily: 'system-ui, sans-serif',
    padding: '0 1.5rem',
  }
  const btn: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '14px 18px',
    marginBottom: 12,
    borderRadius: 10,
    border: '1px solid #e8e7e4',
    background: '#0d0d0d',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
  }
  const note: React.CSSProperties = { fontSize: 13, color: '#888784', marginBottom: 28, lineHeight: 1.6 }

  return (
    <div style={box}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Checkout test (temporary)</h1>
      <p style={note}>
        You must be signed in. Each button starts a real Stripe <strong>test-mode</strong>{' '}
        checkout. Use card <code>4242 4242 4242 4242</code>, any future expiry, any CVC.
        Delete this page when done.
      </p>

      <button
        style={btn}
        onClick={() => startCheckout({ packId: 'supplier-readiness' })}
      >
        Buy pack: Supplier Readiness — $1,999
        <br />
        <span style={{ fontWeight: 400, fontSize: 12, color: '#9ca3af' }}>
          unlocks ghg + supply-chain
        </span>
      </button>

      <button
        style={btn}
        onClick={() => startCheckout({ tier: 'starter', moduleKeys: ['ghg', 'climate-risk'] })}
      >
        Configurator: Starter, GHG + Climate Risk
        <br />
        <span style={{ fontWeight: 400, fontSize: 12, color: '#9ca3af' }}>
          2 modules, 10% bundle discount → should be $1,438
        </span>
      </button>

      <button
        style={btn}
        onClick={() =>
          startCheckout({ tier: 'starter', moduleKeys: ['ghg'], addOns: ['verification'] })
        }
      >
        GHG + Verification add-on
        <br />
        <span style={{ fontWeight: 400, fontSize: 12, color: '#9ca3af' }}>
          $799 + $499 → should be $1,298
        </span>
      </button>
    </div>
  )
}
