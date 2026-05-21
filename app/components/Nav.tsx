'use client'

import { useState, useEffect } from 'react'

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
            ['/climate-ghg', 'Climate · GHG'],
            ['/supply-chain', 'Supply Chain'],
            ['/deals', 'Deals'],
            ['/people', 'People'],
            ['/ai-governance', 'AI Governance'],
            ['/cyber', 'Cyber'],
            ['/advisory', 'Advisory'],
          ].map(([href, label]) => (
            <a key={href} href={href} style={{
              fontSize: 12, color: '#555553', textDecoration: 'none',
              whiteSpace: 'nowrap', fontWeight: 400,
            }}>{label}</a>
          ))}
        </div>

        {/* CTA BUTTONS */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <a href="/dashboard/ghg" style={{
            fontSize: 12, fontWeight: 400, padding: '7px 14px', borderRadius: 8,
            background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4',
            textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap',
          }} className="desktop-only">Free Assessment</a>
          <a href="/dashboard/ghg" style={{
            fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8,
            background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)',
            color: '#fff', textDecoration: 'none', display: 'inline-block',
            whiteSpace: 'nowrap',
          }}>See your emissions instantly →</a>

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
            ['/climate-ghg', 'Climate · GHG', 'SB 253 · CDP · ESRS E1 · GHG Protocol'],
            ['/supply-chain', 'Supply Chain', 'Scope 3 Cat.1 · EcoVadis · CS3D · ESRS S2'],
            ['/deals', 'Deals & Investment', 'M&A diligence · PE · IFRS S2 · LP ESG'],
            ['/people', 'People & Workforce', 'ESRS S1 · EU Pay Transparency · CA Pay Data'],
            ['/ai-governance', 'AI Governance', 'EU AI Act · NIST AI RMF · ISO 42001'],
            ['/cyber', 'Cyber Governance', 'NIS2 · DORA · SEC cyber · ISO 27001'],
            ['/advisory', 'Advisory', 'Expert guidance · Fixed fees · Named advisors'],
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
          <div style={{ marginTop: '1rem' }}>
            <a href="/dashboard/ghg" style={{
              display: 'block', textAlign: 'center', padding: '13px',
              borderRadius: 8, fontSize: 14, fontWeight: 500,
              background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)',
              color: '#0d0d0d', textDecoration: 'none',
            }}>See your emissions instantly →</a>
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
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .desktop-only { display: none !important; }
          .hamburger { display: flex !important; }
        }
      `}</style>
    </>
  )
}

export { daysUntil }
