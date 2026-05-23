'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function SignupPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', company: '', role: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          first_name: form.firstName,
          last_name: form.lastName,
          company: form.company,
          role: form.role,
        }
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', padding: '2rem' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: 24 }}>✓</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>Check your email</h2>
          <p style={{ fontSize: 14, color: '#555553', lineHeight: 1.7, fontWeight: 300, marginBottom: '1.5rem' }}>
            We've sent a confirmation link to <strong>{form.email}</strong>. Click the link to activate your account and start your free assessment.
          </p>
          <a href="/login" style={{ fontSize: 13, color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Back to sign in →</a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' as const }}>

      {/* NAV */}
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
        </a>
        <span style={{ fontSize: 12, color: '#888784' }}>Already have an account? <a href="/login" style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Sign in →</a></span>
      </nav>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* HEADER */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>Your sustainability compliance platform</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>Countless compliance requirements. One Intelligent Platform.</h1>
            <p style={{ fontSize: 14, color: '#888784', fontWeight: 300 }}>Whether your driver is a regulator, a board, an investor, or a customer — ThemisIQ is your sustainability compliance reporting solution.</p>
          </div>

          {/* FORM */}
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
            {error && (
              <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: '1rem' }}>
                <p style={{ fontSize: 13, color: '#B91C1C', margin: 0 }}>{error}</p>
              </div>
            )}

            <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} placeholder="Lisa" required style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} placeholder="Foster" required style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Work email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="you@company.com" required style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Password</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="Min. 8 characters" required minLength={8} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Company name</label>
                <input value={form.company} onChange={e => setForm(f => ({...f, company: e.target.value}))} placeholder="Acme Corp" required style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Your role</label>
                <input value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))} placeholder="e.g. CFO, Head of Sustainability" style={inputStyle} />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ fontSize: 14, fontWeight: 500, padding: '11px', borderRadius: 8, background: loading ? '#e8e7e4' : 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: loading ? '#888784' : '#0d0d0d', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4 }}
              >
                {loading ? 'Setting up your account...' : 'Create my account →'}
              </button>

              <p style={{ fontSize: 11, color: '#888784', textAlign: 'center', margin: 0 }}>
                By signing up you agree to our <a href="/terms" style={{ color: '#555553', textDecoration: 'underline' }}>Terms of Service</a> and <a href="/privacy" style={{ color: '#555553', textDecoration: 'underline' }}>Privacy Policy</a>
              </p>
            </form>
          </div>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: '#888784' }}>
            Already have an account? <a href="/login" style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Sign in →</a>
          </p>

        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', fontSize: 14, padding: '10px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }
