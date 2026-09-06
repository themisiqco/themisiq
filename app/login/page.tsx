'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Where to go after login. Only allow same-site relative paths (no open redirects).
  const rawNext =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('next')
      : null
  const nextUrl = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//')
    ? rawNext
    : '/dashboard'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.href = nextUrl
    }
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' as const }}>

      {/* NAV */}
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
        </a>
        <span style={{ fontSize: 12, color: '#888784' }}>Don't have an account? <a href={`/signup?next=${encodeURIComponent(nextUrl)}`} style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Create an account →</a></span>
      </nav>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* HEADER */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>Welcome back</h1>
            <p style={{ fontSize: 14, color: '#888784', fontWeight: 400 }}>Sign in to your ThemisIQ account</p>
          </div>

          {/* FORM */}
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
            {error && (
              <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: '1rem' }}>
                <p style={{ fontSize: 13, color: '#B91C1C', margin: 0 }}>{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
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

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: 6 }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ width: '100%', fontSize: 14, padding: '10px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const }}
                />
                <div style={{ textAlign: 'right', marginTop: 6 }}>
                  <a href="/forgot-password" style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none' }}>Forgot password?</a>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ fontSize: 14, fontWeight: 500, padding: '11px', borderRadius: 8, background: loading ? '#e8e7e4' : 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: loading ? '#888784' : '#0d0d0d', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
              >
                {loading ? 'Signing in...' : 'Sign in →'}
              </button>
            </form>

            <div style={{ height: '0.5px', background: '#e8e7e4', margin: '1.5rem 0' }} />

            <p style={{ fontSize: 12, color: '#888784', textAlign: 'center', margin: 0 }}>
              By signing in you agree to our <a href="/terms" style={{ color: '#555553', textDecoration: 'underline' }}>Terms of Service</a> and <a href="/privacy" style={{ color: '#555553', textDecoration: 'underline' }}>Privacy Policy</a>
            </p>
          </div>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: '#888784' }}>
Don't have an account? <a href={`/signup?next=${encodeURIComponent(nextUrl)}`} style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Create your account →</a>
          </p>

        </div>
      </div>
    </div>
  )
}