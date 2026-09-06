'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Always show the same confirmation regardless of whether the email exists,
      // to avoid revealing which addresses have accounts.
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' as const }}>

      {/* NAV */}
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
        </a>
        <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Remember your password? <a href="/login" style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Sign in →</a></span>
      </nav>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* HEADER */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>Reset your password</h1>
            <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', fontWeight: 400 }}>Enter your email and we'll send you a reset link</p>
          </div>

          {/* CARD */}
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
            {sent ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#ECF7F2', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 8, padding: '14px 16px', marginBottom: '1rem' }}>
                  <p style={{ fontSize: 14, color: '#0F6E56', margin: 0, fontWeight: 500 }}>Check your inbox</p>
                </div>
                <p style={{ fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.5, margin: 0 }}>
                  If an account exists for <strong style={{ color: '#555553', fontWeight: 500 }}>{email}</strong>, we've sent a link to reset your password. It may take a minute to arrive — check your spam folder if you don't see it.
                </p>
              </div>
            ) : (
              <>
                {error && (
                  <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: '1rem' }}>
                    <p style={{ fontSize: 13, color: '#B91C1C', margin: 0 }}>{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: 6 }}>Work email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      style={{ width: '100%', fontSize: 14, padding: '10px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{ fontSize: 14, fontWeight: 500, padding: '11px', borderRadius: 8, background: loading ? '#e8e7e4' : 'var(--color-brand)', color: loading ? 'var(--color-ink-muted)' : '#0d0d0d', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
                  >
                    {loading ? 'Sending...' : 'Send reset link →'}
                  </button>
                </form>
              </>
            )}
          </div>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: 'var(--color-ink-muted)' }}>
            Remember your password? <a href="/login" style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Sign in →</a>
          </p>

        </div>
      </div>
    </div>
  )
}
