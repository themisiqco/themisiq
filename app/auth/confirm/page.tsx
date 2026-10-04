'use client'

// app/auth/confirm — the link in the sign-in code email (LEAD1 L2, Oct 2026). The email carries
// {{ .SiteURL }}/auth/confirm?token_hash=…&type=email (docs/review/design-lead1.md section 10, step 6), so a visitor who
// clicks rather than typing the code is signed in here, on any device, by verifyOtp({ token_hash, type }) in the
// browser. The same steps as /auth/callback (lib/auth/completeSignIn.ts), so a template that sends the fragment form
// instead also works.
//
// THEN THE CLAIM (LEAD1 L4, design 1.6). With no calculation in hand, POST /api/ghg/free-calc/claim takes the newest
// unexpired calculation held for the verified email (lib/ghg/freeCalcService.ts), so a link opened on a phone saves
// what was typed on a laptop. What happens next is lib/ghg/keepResults.ts confirmStep: the saved calculation opens;
// nothing waiting (an ordinary sign-in by link) lands on the calculator as before; the one-free choice and the
// conflict are shown with the route's own sentence. The link carries no pending id, and none is needed.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { completeSignIn } from '../../../lib/auth/completeSignIn'
import { CONFIRM_LANDING } from '../../../lib/auth/linkAction'
import { claimOutcome, confirmStep, clearPendingMarker, type ConfirmStep } from '../../../lib/ghg/keepResults'
import { clearGhgDraft } from '../../../lib/ghg/draft'
import AuthLinkStatus from '../AuthLinkStatus'

async function claimHeld(extra: Record<string, unknown> = {}): Promise<ConfirmStep> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { go: CONFIRM_LANDING }
  try {
    const res = await fetch('/api/ghg/free-calc/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(extra),
    })
    const outcome = claimOutcome(res.status, await res.json().catch(() => ({})))
    // Saved: on the device that typed the calculation, its draft and the pending-code marker are done with, or the
    // next visit would restore them and ask for a code again. On another device there is nothing to clear.
    if (outcome.kind === 'saved') { clearGhgDraft(); clearPendingMarker() }
    return confirmStep(outcome, CONFIRM_LANDING)
  } catch {
    return confirmStep(claimOutcome(0, {}), CONFIRM_LANDING)
  }
}

export default function AuthConfirmPage() {
  const [message, setMessage] = useState<string | null>(null)
  const [choice, setChoice] = useState<Extract<ConfirmStep, { message: string }> | null>(null)
  const [busy, setBusy] = useState(false)

  const follow = (step: ConfirmStep) => {
    if ('go' in step) window.location.replace(step.go)
    else setChoice(step)
  }

  useEffect(() => {
    void completeSignIn(window.location.href, supabase.auth).then(async result => {
      if (!result.ok) { setMessage(result.message); return }
      follow(await claimHeld())
    })
  }, [])

  if (!choice) return <AuthLinkStatus message={message} />
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 420, width: '100%', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem', boxSizing: 'border-box' }}>
        <p role="status" style={{ fontSize: 14, color: '#0d0d0d', lineHeight: 1.6, margin: '0 0 1rem' }}>You&apos;re signed in. {choice.message}</p>
        {choice.actions.map(a => 'href' in a ? (
          <Link key={a.label} href={a.href} style={{ display: 'block', textAlign: 'center', fontSize: 14, fontWeight: 600, padding: '11px 18px', marginTop: 10, borderRadius: 10, color: 'var(--color-brand)', border: '0.5px solid var(--color-brand)', textDecoration: 'none' }}>{a.label}</Link>
        ) : (
          <button key={a.label} type="button" disabled={busy} onClick={async () => { setBusy(true); follow(await claimHeld({ replaceFreeId: a.replaceFreeId })); setBusy(false) }}
            style={{ display: 'block', width: '100%', fontSize: 14, fontWeight: 600, padding: '12px 18px', marginTop: 10, borderRadius: 10, border: 'none', cursor: busy ? 'wait' : 'pointer', background: 'var(--color-brand)', color: 'var(--color-on-dark)' }}>{busy ? 'Saving…' : a.label}</button>
        ))}
      </div>
    </div>
  )
}
