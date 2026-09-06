// app/checkout/page.tsx
'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { resumePendingCheckout } from '../../lib/checkout'

function CheckoutResume() {
  const router = useRouter()
  const params = useSearchParams()
  const [msg, setMsg] = useState('Starting secure checkout…')

  useEffect(() => {
    const intent = params.get('intent') ?? undefined
    resumePendingCheckout(intent).then((had) => {
      if (!had) {
        // Nothing to resume (e.g. visited directly) — send to pricing.
        router.replace('/pricing')
      }
      // If it had an intent, startCheckout is already redirecting to Stripe.
    }).catch(() => setMsg('Could not start checkout. Redirecting…'))
  }, [params, router])

  return <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>{msg}</div>
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>Loading…</div>}>
      <CheckoutResume />
    </Suspense>
  )
}