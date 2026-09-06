'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

type Status = 'checking' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    // supabase-js auto-detects the recovery session from the URL hash on load.
    // Listen for it, and also check for an already-established session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || (session && status !== 'done')) {
        setStatus('ready')
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      if (data.session) setStatus('ready')
    })

    // If no recovery session shows up shortly, the link is missing/expired.
    const timeout = setTimeout(() => {
      if (!mounted) return
      setStatus(s => (s === 'checking' ? 'invalid' : s))
    }, 3500)

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
      clearTimeout(timeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setStatus('done')
      setTimeout(() => { window.location.href = '/dashboard' }, 1200)
    }
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' as const }}>

      {/* NAV */}
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
        </a>
        <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}><a href="/login" style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Back to sign in →</a></span>
      </nav>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* HEADER */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>Set a new password</h1>
            <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', fontWeight: 400 }}>Choose a new password for your account</p>
          </div>

          {/* CARD */}
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>

            {status === 'checking' && (
              <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', textAlign: 'center', fontWeight: 400, margin: 0 }}>Verifying your reset link…</p>
            )}

            {status === 'invalid' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: '1rem' }}>
                  <p style={{ fontSize: 13, color: '#B91C1C', margin: 0 }}>This reset link is invalid or has expired.</p>
                </div>
                <a href="/forgot-password" style={{ fontSize: 14, color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Request a new link →</a>
              </div>
            )}

            {status === 'done' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#ECF7F2', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 8, padding: '12px 16px' }}>
                  <p style={{ fontSize: 14, color: '#0F6E56', margin: 0, fontWeight: 500 }}>Password updated — signing you in…</p>
                </div>
              </div>
            )}

            {status === 'ready' && (
              <>
                {error && (
                  <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: '1rem' }}>
                    <p style={{ fontSize: 13, color: '#B91C1C', margin: 0 }}>{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: 6 }}>New password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      style={{ width: '100%', fontSize: 14, padding: '10px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: 6 }}>Confirm new password</label>
                    <input
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      required
                      style={{ width: '100%', fontSize: 14, padding: '10px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{ fontSize: 14, fontWeight: 500, padding: '11px', borderRadius: 8, background: loading ? '#e8e7e4' : 'var(--color-brand)', color: loading ? 'var(--color-ink-muted)' : '#0d0d0d', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
                  >
                    {loading ? 'Updating...' : 'Update password →'}
                  </button>
                </form>
              </>
            )}

          </div>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: 'var(--color-ink-muted)' }}>
            <a href="/login" style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Back to sign in →</a>
          </p>

        </div>
      </div>
    </div>
  )
}
