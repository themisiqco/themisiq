'use client'

// app/unsubscribe: the page the unsubscribe link in an email opens (LEAD1 L6, Oct 2026; design section 5).
//
// ⚠️ LOADING THIS PAGE CHANGES NOTHING (L6 amendment, 5 Oct 2026). Security scanners open links in a real browser and
// run the page's script, so a withdrawal on load would unsubscribe people who never clicked. On load the page only
// CHECKS the link (POST { action: 'check' }, read only) and shows the address it is for, masked. The withdrawal is the
// button, and nothing else: POST { action: 'unsubscribe' }. It still takes effect at once when pressed.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ThemisIQLogo from '../components/ThemisIQLogo'
import { CONSENT_COPY } from '../../lib/consent/marketing'

type View =
  | { kind: 'checking' }
  | { kind: 'confirm'; masked: string }
  | { kind: 'working'; masked: string }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string }

async function post(token: string | null, action: 'check' | 'unsubscribe') {
  const res = await fetch('/api/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action }) })
  const body = await res.json().catch(() => ({})) as { ok?: boolean; message?: string; maskedEmail?: string }
  return { ok: res.ok && body.ok === true, body }
}

export default function UnsubscribePage() {
  const [view, setView] = useState<View>({ kind: 'checking' })
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get('token')
    // Read only. Posted even without a token: the route answers "not valid", in the same words as any bad link.
    void post(t, 'check')
      .then(({ ok, body }) => {
        setToken(t)
        setView(ok && body.maskedEmail ? { kind: 'confirm', masked: body.maskedEmail } : { kind: 'error', message: body.message || CONSENT_COPY.failed })
      })
      .catch(() => setView({ kind: 'error', message: CONSENT_COPY.failed }))
  }, [])

  const confirm = async (masked: string) => {
    setView({ kind: 'working', masked })
    try {
      const { ok, body } = await post(token, 'unsubscribe')
      setView(ok ? { kind: 'done', message: body.message || CONSENT_COPY.unsubscribed } : { kind: 'error', message: body.message || CONSENT_COPY.failed })
    } catch {
      setView({ kind: 'error', message: CONSENT_COPY.failed })
    }
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' as const }}>
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none' }}><ThemisIQLogo size={19} /></Link>
      </nav>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 16px' }}>
        <div style={{ maxWidth: 440, width: '100%', boxSizing: 'border-box' as const, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
          {view.kind === 'checking' && <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', margin: 0 }}>{CONSENT_COPY.checking}</p>}
          {(view.kind === 'confirm' || view.kind === 'working') && (
            <>
              <p style={{ fontSize: 14, color: '#0d0d0d', lineHeight: 1.6, margin: '0 0 1.25rem' }}>{CONSENT_COPY.confirmLine(view.masked)}</p>
              <button type="button" data-unsubscribe-confirm onClick={() => { void confirm(view.masked) }} disabled={view.kind === 'working'}
                style={{ fontSize: 14, fontWeight: 600, padding: '12px 22px', borderRadius: 10, border: 'none', background: 'var(--color-brand)', color: 'var(--color-on-dark)', cursor: view.kind === 'working' ? 'wait' : 'pointer' }}>
                {view.kind === 'working' ? CONSENT_COPY.unsubscribing : CONSENT_COPY.confirmButton}
              </button>
            </>
          )}
          {view.kind === 'done' && (
            <>
              <p role="status" style={{ fontSize: 14, color: '#0d0d0d', lineHeight: 1.6, margin: '0 0 1.25rem' }}>{view.message}</p>
              <Link href="/" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none' }}>Go to ThemisIQ →</Link>
            </>
          )}
          {view.kind === 'error' && (
            <>
              <p role="alert" style={{ fontSize: 14, color: '#B91C1C', lineHeight: 1.6, margin: '0 0 1.25rem' }}>{view.message}</p>
              <Link href="/dashboard" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none' }}>Go to your dashboard →</Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
