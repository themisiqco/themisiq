'use client'

// app/dashboard/_components/EmailUpdatesSetting.tsx
//
// "Email updates" on the dashboard (LEAD1 L6, Oct 2026; design section 5: "the account page also shows the setting").
// Reads the signed-in account's own consent rows (the M5 owner policy allows it) and shows the current choice. The box
// shows the same words as the "Keep my results" form; saving posts to /api/account/marketing-consent, which records a
// new consent with those words, or withdraws the active one. Nothing is deleted.

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { MARKETING_CONSENT, CONSENT_COPY, activeConsent, type ConsentRow } from '../../../lib/consent/marketing'

export default function EmailUpdatesSetting() {
  const [current, setCurrent] = useState<boolean | null>(null)
  const [choice, setChoice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase.from('marketing_consents').select('id, granted, created_at, withdrawn_at')
      .eq('purpose', 'updates').order('created_at', { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('[email-updates] read failed:', error.message); setCurrent(false); return }
        const on = activeConsent((data ?? []) as ConsentRow[]) !== null
        setCurrent(on)
        setChoice(on)
      })
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    const { data: { session } } = await supabase.auth.getSession()
    let msg: string = CONSENT_COPY.failed
    try {
      const res = await fetch('/api/account/marketing-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ granted: choice, version: MARKETING_CONSENT.version }),
      })
      const body = await res.json().catch(() => ({})) as { ok?: boolean; message?: string }
      if (res.ok && body.ok) setCurrent(choice)
      if (body.message) msg = body.message
    } catch { /* the plain failure sentence: nothing was changed */ }
    setMessage(msg)
    setSaving(false)
  }

  if (current === null) return null
  return (
    <div data-email-updates style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.25rem 1.5rem', marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{CONSENT_COPY.settingsTitle}</div>
      <p style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, margin: '0 0 10px' }}>{CONSENT_COPY.settingsIntro} {current ? CONSENT_COPY.settingsOn : CONSENT_COPY.settingsOff}</p>
      <label htmlFor="email-updates-box" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5, color: '#0d0d0d', cursor: 'pointer' }}>
        <input id="email-updates-box" type="checkbox" checked={choice} onChange={e => setChoice(e.target.checked)} disabled={saving}
          style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: 'var(--color-brand)' }} />
        <span>{MARKETING_CONSENT.wording}</span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" onClick={() => { void save() }} disabled={saving || choice === current}
          style={{ fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--color-brand)', color: 'var(--color-on-dark)', cursor: saving || choice === current ? 'default' : 'pointer', opacity: choice === current ? 0.6 : 1 }}>
          {saving ? CONSENT_COPY.settingsSaving : CONSENT_COPY.settingsSave}
        </button>
        {message && <span role="status" style={{ fontSize: 12, color: '#555553' }}>{message}</span>}
      </div>
    </div>
  )
}
