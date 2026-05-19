'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = target.getTime() - today.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const days = daysUntil('2026-08-10')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.href = '/login'
      } else {
        setUser(session.user)
        setLoading(false)
      }
    })
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/logo.png" alt="ThemisIQ" style={{ height: 32, width: 'auto', marginBottom: '1rem' }} />
          <p style={{ fontSize: 13, color: '#888784' }}>Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>

      {/* TOP NAV */}
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
          </a>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {[['Dashboard', '/dashboard'], ['GHG Inventory', '/dashboard/ghg'], ['Reports', '/dashboard/reports'], ['Settings', '/dashboard/settings']].map(([label, href]) => (
              <a key={label} href={href} style={{ fontSize: 13, color: href === '/dashboard' ? '#7425e3' : '#555553', textDecoration: 'none', fontWeight: href === '/dashboard' ? 500 : 400 }}>{label}</a>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: 12, color: '#888784' }}>{user?.email}</span>
          <button onClick={handleSignOut} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: 'none', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#555553' }}>Sign out</button>
        </div>
      </nav>

      {/* MAIN */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* WELCOME */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>
            Welcome back{user?.user_metadata?.first_name ? `, ${user.user_metadata.first_name}` : ''}
          </h1>
          <p style={{ fontSize: 14, color: '#888784', fontWeight: 300 }}>Your ThemisIQ compliance dashboard</p>
        </div>

        {/* SB 253 COUNTDOWN BANNER */}
        <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem 2rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>SB 253 — California Climate Corporate Data Accountability Act</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: '#fff' }}>
              <span style={{ background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontStyle: 'italic' }}>{days} days</span> until the August 10, 2026 deadline
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: 300 }}>Scope 1 + 2 GHG disclosure required. Start your inventory now.</div>
          </div>
          <a href="/dashboard/ghg" style={{ fontSize: 13, fontWeight: 500, padding: '10px 24px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Start GHG Inventory →
          </a>
        </div>

        {/* STATUS CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: '2rem' }}>
          {[
            { label: 'GHG Inventory', status: 'Not started', pct: 0, color: '#888784', bg: '#f8f7f5', href: '/dashboard/ghg', action: 'Start now →' },
            { label: 'CARB Template', status: 'Waiting for inventory', pct: 0, color: '#888784', bg: '#f8f7f5', href: '/dashboard/ghg', action: 'Complete inventory first' },
            { label: 'Compliance Assessment', status: 'Completed', pct: 100, color: '#0F6E56', bg: '#E1F5EE', href: '/assess', action: 'View results →' },
          ].map(({ label, status, pct, color, bg, href, action }) => (
            <div key={label} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>{label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 4, background: '#e8e7e4', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#0F6E56' : 'linear-gradient(90deg,#7425e3,#1fb1ff)', borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color }}>{pct}%</span>
              </div>
              <div style={{ fontSize: 12, color: '#888784', marginBottom: 8 }}>{status}</div>
              <a href={href} style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>{action}</a>
            </div>
          ))}
        </div>

        {/* MODULES */}
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: '#0d0d0d', marginBottom: '1rem' }}>Your ThemisIQ modules</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { icon: '🌱', name: 'Climate · GHG', desc: 'Scope 1 + 2 inventory', status: 'active', href: '/dashboard/ghg' },
              { icon: '🌡️', name: 'Climate · Risk', desc: 'TCFD · IFRS S2', status: 'coming', href: '#' },
              { icon: '🔗', name: 'Supply Chain', desc: 'Scope 3 · EcoVadis', status: 'coming', href: '#' },
              { icon: '💼', name: 'Deals', desc: 'M&A climate diligence', status: 'coming', href: '#' },
              { icon: '👥', name: 'People', desc: 'ESRS S1 · Pay equity', status: 'coming', href: '#' },
              { icon: '🤖', name: 'AI Governance', desc: 'EU AI Act · NIST', status: 'coming', href: '#' },
              { icon: '🔒', name: 'Cyber', desc: 'NIS2 · DORA · SEC', status: 'coming', href: '#' },
              { icon: '🎯', name: 'Advisory', desc: 'Expert guidance', status: 'coming', href: '/advisory' },
            ].map(({ icon, name, desc, status, href }) => (
              <a key={name} href={href} style={{ background: status === 'active' ? '#fff' : '#f8f7f5', border: `0.5px solid ${status === 'active' ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '1.25rem', textDecoration: 'none', display: 'block', opacity: status === 'coming' ? 0.6 : 1 }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>{name}</div>
                <div style={{ fontSize: 11, color: '#888784', fontWeight: 300 }}>{desc}</div>
                {status === 'coming' && <div style={{ fontSize: 10, fontWeight: 600, color: '#888784', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Coming soon</div>}
                {status === 'active' && <div style={{ fontSize: 10, fontWeight: 600, color: '#7425e3', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active →</div>}
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
