'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import ThemisIQLogo from '../components/ThemisIQLogo'
import Turnstile from '../components/Turnstile'
import { authErrorText, isNoAccountForCode } from '../../lib/auth/authErrors'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Turnstile (LEAD1 L2): the token goes with every auth call. Null until the widget answers, and always null when no
  // site key is configured, in which case the calls go out exactly as before. Single-use: reset after each call.
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const spendCaptcha = () => { const t = captcha ?? undefined; setCaptcha(null); setCaptchaReset(n => n + 1); return t }
  // "Email me a sign-in code" (LEAD1 L2): the code is typed on this page. 'idle' shows the button; 'sent' the code box.
  const [codeStage, setCodeStage] = useState<'off' | 'idle' | 'sent'>('off')
  const [code, setCode] = useState('')
  const [codeNotice, setCodeNotice] = useState('')
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

    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: spendCaptcha() } })

    if (error) {
      setError(authErrorText(error))
      setLoading(false)
    } else {
      window.location.href = nextUrl
    }
  }

  // Sends the code. shouldCreateUser: false, so this page never creates an account; an address with no account is told
  // the same as one with an account (no way to test which addresses are registered).
  const requestCode = async () => {
    if (!email) { setError('Enter your work email first.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, captchaToken: spendCaptcha() } })
    setLoading(false)
    if (error && !isNoAccountForCode(error)) { setError(authErrorText(error)); return }
    setCodeNotice(`If an account exists for ${email}, we’ve sent it a 6-digit sign-in code. Enter it below.`)
    setCodeStage('sent')
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    if (error) {
      setError(`That code didn’t work: ${error.message}. Check it, or ask for a new one.`)
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
          <ThemisIQLogo size={19} />
        </a>
        <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Don't have an account? <a href={`/signup?next=${encodeURIComponent(nextUrl)}`} style={{ color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 500 }}>Create an account →</a></span>
      </nav>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* HEADER */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>Welcome back</h1>
            <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', fontWeight: 400 }}>Sign in to your ThemisIQ account</p>
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
                  <a href="/forgot-password" style={{ fontSize: 12, color: 'var(--color-brand)', textDecoration: 'none' }}>Forgot password?</a>
                </div>
              </div>

              <Turnstile onToken={setCaptcha} resetKey={captchaReset} />

              <button
                type="submit"
                disabled={loading}
                style={{ fontSize: 14, fontWeight: 500, padding: '11px', borderRadius: 8, background: loading ? '#e8e7e4' : 'var(--color-brand)', color: loading ? 'var(--color-ink-muted)' : '#0d0d0d', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
              >
                {loading ? 'Signing in...' : 'Sign in →'}
              </button>
            </form>

            {/* SIGN IN WITH A CODE (LEAD1 L2). Beside the password form, on the same page: the code is emailed and
                typed here. The email field above is the one the code goes to. Free accounts sign in only this way. */}
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              {codeStage === 'off' ? (
                <button type="button" onClick={() => setCodeStage('idle')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--color-brand)' }}>
                  Email me a sign-in code instead
                </button>
              ) : codeStage === 'idle' ? (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                  <p style={{ fontSize: 12, color: 'var(--color-ink-muted)', margin: 0 }}>We’ll email a 6-digit code to the work email above.</p>
                  <button type="button" onClick={() => { void requestCode() }} disabled={loading} style={{ fontSize: 14, fontWeight: 500, padding: '10px', borderRadius: 8, background: 'none', color: 'var(--color-brand)', border: '0.5px solid var(--color-brand)', cursor: loading ? 'not-allowed' : 'pointer' }}>
                    {loading ? 'Sending...' : 'Email me a sign-in code'}
                  </button>
                </div>
              ) : (
                <form onSubmit={verifyCode} style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, textAlign: 'left' as const }}>
                  <p style={{ fontSize: 13, color: '#0F6E56', margin: 0, lineHeight: 1.5 }}>{codeNotice}</p>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d' }}>Sign-in code</label>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="123456"
                    required
                    style={{ width: '100%', fontSize: 18, letterSpacing: 4, padding: '10px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const }}
                  />
                  <button type="submit" disabled={loading} style={{ fontSize: 14, fontWeight: 500, padding: '11px', borderRadius: 8, background: loading ? '#e8e7e4' : 'var(--color-brand)', color: loading ? 'var(--color-ink-muted)' : '#0d0d0d', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
                    {loading ? 'Signing in...' : 'Sign in with this code →'}
                  </button>
                  <button type="button" onClick={() => { void requestCode() }} disabled={loading} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--color-brand)', alignSelf: 'center' as const }}>
                    Send a new code
                  </button>
                </form>
              )}
            </div>

            <div style={{ height: '0.5px', background: '#e8e7e4', margin: '1.5rem 0' }} />

            <p style={{ fontSize: 12, color: 'var(--color-ink-muted)', textAlign: 'center', margin: 0 }}>
              By signing in you agree to our <a href="/terms" style={{ color: '#555553', textDecoration: 'underline' }}>Terms of Service</a> and <a href="/privacy" style={{ color: '#555553', textDecoration: 'underline' }}>Privacy Policy</a>
            </p>
          </div>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: 'var(--color-ink-muted)' }}>
Don't have an account? <a href={`/signup?next=${encodeURIComponent(nextUrl)}`} style={{ color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 500 }}>Create your account →</a>
          </p>

        </div>
      </div>
    </div>
  )
}