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

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [days, setDays] = useState(0)
  const [isAuthed, setIsAuthed] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsAuthed(!!session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setIsAuthed(!!session))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setDays(daysUntil('2026-08-10'))
  }, [])

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.5rem', height: 64,
        background: 'rgba(255,255,255,0.97)',
        borderBottom: '0.5px solid #e8e7e4',
        backdropFilter: 'blur(8px)',
      }}>
        {/* LOGO */}
        <a href="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <img src="/logo.png" alt="ThemisIQ" style={{ height: 44, width: "auto", display: "block" }} />
        </a>

        {/* DESKTOP NAV */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1.25rem',
          flex: 1, justifyContent: 'center',
          overflow: 'hidden',
        }} className="desktop-nav">
          {[
           ['/climate-ghg', 'GHG Emissions'],
            ['/climate-risk', 'Climate Risk'],
            ['/supply-chain', 'Supply Chain'],
            ['/deals', 'Deals'],
            ['/people', 'People'],
            ['/ai-governance', 'AI Governance'],
            ['/cyber', 'Cyber'],
            ['/verification-readiness', 'Verification'],
            ['/pricing', 'Pricing'],
          ].map(([href, label]) => (
            <a key={href} href={href} style={{
              fontSize: 12, color: '#555553', textDecoration: 'none',
              whiteSpace: 'nowrap', fontWeight: 400,
            }}>{label}</a>
          ))}
        </div>

        {/* CTA BUTTONS */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {isAuthed && (
            <a href="/dashboard" style={{
              fontSize: 12, fontWeight: 500, padding: '7px 10px',
              color: '#0d0d0d', textDecoration: 'none',
              display: 'inline-block', whiteSpace: 'nowrap',
            }} className="desktop-only">Dashboard</a>
          )}
          <a href={isAuthed ? '#' : '/login'} onClick={(e) => { if (isAuthed) { e.preventDefault(); supabase.auth.signOut() } }} style={{
            fontSize: 12, fontWeight: 500, padding: '7px 10px',
            color: '#555553', textDecoration: 'none',
            display: 'inline-block', whiteSpace: 'nowrap',
          }} className="desktop-only">{isAuthed ? 'Log out' : 'Log in'}</a>
          <a href="/dashboard/supply-chain/portal" style={{ fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, background: '#0F6E56', color: '#fff', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' }} className="desktop-only">SupplierPortal →</a>
          <a href="/assess" style={{
            fontSize: 12, fontWeight: 400, padding: '7px 14px', borderRadius: 8,
            background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4',
            textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap',
          }} className="desktop-only">Free Assessment →</a>
          <a href="/pricing" style={{
            fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8,
            background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)',
            color: '#fff', textDecoration: 'none', display: 'inline-block',
            whiteSpace: 'nowrap',
          }}>Build your platform →</a>

          {/* HAMBURGER */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="hamburger"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 6, display: 'none', flexDirection: 'column',
              gap: 4, alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Menu"
          >
            <span style={{ width: 20, height: 1.5, background: '#0d0d0d', display: 'block', transition: 'all 0.2s', transform: menuOpen ? 'rotate(45deg) translate(4px, 4px)' : 'none' }} />
            <span style={{ width: 20, height: 1.5, background: '#0d0d0d', display: 'block', opacity: menuOpen ? 0 : 1, transition: 'all 0.2s' }} />
            <span style={{ width: 20, height: 1.5, background: '#0d0d0d', display: 'block', transition: 'all 0.2s', transform: menuOpen ? 'rotate(-45deg) translate(4px, -4px)' : 'none' }} />
          </button>
        </div>
      </nav>

      {/* MOBILE MENU */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 64, left: 0, right: 0, bottom: 0,
          background: '#fff', zIndex: 99, padding: '1.5rem',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
          borderTop: '0.5px solid #e8e7e4', overflowY: 'auto',
        }}>
          {[
            ['/climate-ghg', 'GHG Emissions', 'SB 253 · CDP · ESRS E1 · GHG Protocol · Scope 3'],
            ['/climate-risk', 'Climate Risk', 'TCFD · IFRS S2 · ESRS E1 · scenario analysis'],
            ['/supply-chain', 'Supply Chain', 'Supplier Portal · CS3D · EcoVadis · ESRS S2'],
            ['/deals', 'Deals & Investment', 'M&A diligence · PE · IFRS S2 · LP ESG'],
            ['/people', 'People & Workforce', 'ESRS S1 · EU Pay Transparency · CA Pay Data'],
            ['/ai-governance', 'AI Governance', 'EU AI Act · NIST AI RMF · ISO 42001'],
            ['/cyber', 'Cyber Governance', 'NIS2 · DORA · SEC cyber · ISO 27001'],
            ['/verification-readiness', 'Verification Readiness', 'ISO 14064-3 · ISAE 3410 · verifier-ready package'],
            ['/pricing', 'Pricing', 'Plans, tiers, and what each includes'],
            ['/assess', 'Free Assessment →', 'Check which regulations apply to you'],
          ].map(([href, label, sub]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)} style={{
              display: 'block', padding: '14px 0',
              borderBottom: '0.5px solid #e8e7e4',
              textDecoration: 'none',
            }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>{sub}</div>
            </a>
          ))}
          {isAuthed && (
            <a href="/dashboard" onClick={() => setMenuOpen(false)} style={{
              display: 'block', padding: '14px 0',
              borderBottom: '0.5px solid #e8e7e4',
              textDecoration: 'none',
            }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>Dashboard</div>
              <div style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>Your platform home</div>
            </a>
          )}
          <a
            href={isAuthed ? '#' : '/login'}
            onClick={(e) => {
              if (isAuthed) { e.preventDefault(); supabase.auth.signOut() }
              setMenuOpen(false)
            }}
            style={{
              display: 'block', padding: '14px 0',
              borderBottom: '0.5px solid #e8e7e4',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>{isAuthed ? 'Log out' : 'Log in'}</div>
            <div style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>{isAuthed ? 'Sign out of your account' : 'Access your dashboard'}</div>
          </a>
          <div style={{ marginTop: '1rem' }}>
            <a href="/pricing" style={{
              display: 'block', textAlign: 'center', padding: '13px',
              borderRadius: 8, fontSize: 14, fontWeight: 500,
              background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)',
              color: '#fff', textDecoration: 'none',
            }}>Build your platform →</a>
          </div>
          {days > 0 && (
            <div style={{
              marginTop: '1rem', background: '#FCEBEB', borderRadius: 8,
              padding: '12px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#B91C1C' }}>
                SB 253 deadline: August 10, 2026
              </div>
              <div style={{ fontSize: 12, color: '#888784', marginTop: 2 }}>
                {days} days away
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 1100px) {
          .desktop-nav { display: none !important; }
          .desktop-only { display: none !important; }
          .hamburger { display: flex !important; }
        }
      `}</style>
    </>
  )
}

export { daysUntil }
