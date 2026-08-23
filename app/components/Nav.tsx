'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

// Single source of truth for the header's module links — consumed by BOTH the
// desktop Platform ▾ dropdown (full `label` + `sub`) and the mobile overlay
// (full `label` + `sub`). `labelShort` is retained for any short-label surface.
// Pricing is NOT a module and is kept separate per render site.
const MODULES_NAV: { href: string; label: string; labelShort: string; sub: string }[] = [
  { href: '/climate-ghg', label: 'GHG Emissions', labelShort: 'GHG Emissions', sub: 'SB 253 · CDP · ESRS E1 · GHG Protocol · Scope 3' },
  { href: '/climate-risk', label: 'Climate Risk', labelShort: 'Climate Risk', sub: 'TCFD · IFRS S2 · ESRS E1 · scenario analysis' },
  // Directly after Climate Risk on purpose: the two are the halves of double materiality, and
  // the pairing should be readable in the menu without opening either page.
  { href: '/impact-materiality', label: 'Impact Materiality', labelShort: 'Impact Materiality', sub: 'CSRD · ESRS 1 · ESRS 2 · stakeholder engagement' },
  { href: '/supply-chain', label: 'Supply Chain', labelShort: 'Supply Chain', sub: 'Supplier Portal · CS3D · EcoVadis · ESRS S2' },
  { href: '/deals', label: 'Deals & Investment', labelShort: 'Deals', sub: 'M&A diligence · PE · IFRS S2 · SB 253' },
  { href: '/people', label: 'People & Workforce', labelShort: 'People', sub: 'ESRS S1 · EU Pay Transparency · CA Pay Data' },
  { href: '/ai-governance', label: 'AI Governance', labelShort: 'AI Governance', sub: 'EU AI Act · NIST AI RMF · ISO 42001' },
  { href: '/cyber', label: 'Cyber Governance', labelShort: 'Cyber', sub: 'NIS2 · DORA · SEC cyber · ISO 27001' },
  { href: '/cbam', label: 'CBAM', labelShort: 'CBAM', sub: 'Regulation (EU) 2023/956 · verifier-ready' },
]

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [platformOpen, setPlatformOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const platformRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthed(!!session)
      setUserEmail(session?.user?.email ?? '')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthed(!!session)
      setUserEmail(session?.user?.email ?? '')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Close the Platform / avatar menus on outside-click and on Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (platformRef.current && !platformRef.current.contains(e.target as Node)) setPlatformOpen(false)
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPlatformOpen(false); setAvatarOpen(false) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  // Mutually exclusive: opening one menu closes the other.
  const togglePlatform = () => { setPlatformOpen(o => !o); setAvatarOpen(false) }
  const toggleAvatar = () => { setAvatarOpen(o => !o); setPlatformOpen(false) }

  // Platform menu groups: GHG Emissions + GHG Verification paired at the top.
  const ghg = MODULES_NAV.find(m => m.href === '/climate-ghg')!
  // Verification Readiness was retired 10 Aug 2026 — its nav entry and the ghgVerification lookup
  // went with it. GHG is still pulled out separately; everything else is 'other'.
  const otherModules = MODULES_NAV.filter(m => m.href !== '/climate-ghg')

  const navLinkStyle: React.CSSProperties = { fontSize: 15, color: '#555553', textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 400 }
  const platformItemStyle: React.CSSProperties = { display: 'block', padding: '9px 12px', borderRadius: 8, textDecoration: 'none' }
  const ghostBtn: React.CSSProperties = { fontSize: 12, fontWeight: 400, padding: '7px 14px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' }
  const primaryBtn: React.CSSProperties = { fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8, background: GRAD, color: '#fff', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' }

  const moduleRow = (m: typeof MODULES_NAV[number]) => (
    <a key={m.href} href={m.href} onClick={() => setPlatformOpen(false)} style={platformItemStyle}>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{m.label}</div>
      <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{m.sub}</div>
    </a>
  )

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
        {/* LEFT GROUP: logo · Platform ▾ · Pricing */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <a href="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <img src="/logo.png" alt="ThemisIQ" style={{ height: 44, width: 'auto', display: 'block' }} />
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }} className="desktop-nav">
            {/* Platform ▾ dropdown */}
            <div ref={platformRef} style={{ position: 'relative' }}>
              <button
                onClick={togglePlatform}
                aria-haspopup="true"
                aria-expanded={platformOpen}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, ...navLinkStyle }}
              >
                Solutions <span style={{ fontSize: 12, color: '#555553' }}>▼</span>
              </button>
              {platformOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 14px)', left: 0,
                  width: 340, background: '#fff', border: '0.5px solid #e8e7e4',
                  borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.10)',
                  padding: 8, zIndex: 200, display: 'flex', flexDirection: 'column',
                }}>
                  {moduleRow(ghg)}
                  <div style={{ height: '0.5px', background: '#e8e7e4', margin: '6px 4px' }} />
                  {otherModules.map(moduleRow)}
                </div>
              )}
            </div>

            <a href="/pricing" style={navLinkStyle}>Pricing</a>
          </div>
        </div>

        {/* RIGHT GROUP: CTAs */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          {!isAuthed && (
            <>
              <a href="/login" style={{ fontSize: 12, fontWeight: 500, padding: '7px 10px', color: '#555553', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' }} className="desktop-only">Log in</a>
              <a href="/assess" style={ghostBtn} className="desktop-only">Take the assessment →</a>
            </>
          )}
          {isAuthed && (
            <>
              <a href="/dashboard" style={{ fontSize: 12, fontWeight: 500, padding: '7px 10px', color: '#0d0d0d', textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' }} className="desktop-only">Dashboard</a>
              {/* Avatar menu (Log out lives here) */}
              <div ref={avatarRef} style={{ position: 'relative' }} className="desktop-only">
                <button
                  onClick={toggleAvatar}
                  aria-haspopup="true"
                  aria-expanded={avatarOpen}
                  aria-label="Account menu"
                  style={{ width: 32, height: 32, borderRadius: '50%', background: GRAD, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  {userEmail ? userEmail[0].toUpperCase() : '?'}
                </button>
                {avatarOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 14px)', right: 0,
                    minWidth: 200, background: '#fff', border: '0.5px solid #e8e7e4',
                    borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.10)',
                    padding: 8, zIndex: 200,
                  }}>
                    {userEmail && <div style={{ fontSize: 11, color: '#888784', padding: '4px 12px 8px', wordBreak: 'break-all' }}>{userEmail}</div>}
                    <div style={{ height: '0.5px', background: '#e8e7e4', margin: '0 4px 6px' }} />
                    <button
                      onClick={() => { setAvatarOpen(false); supabase.auth.signOut() }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#0d0d0d', padding: '8px 12px', borderRadius: 8 }}
                    >Log out</button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Build: desktop shows it only when logged-out; mobile top bar always shows
              it (the .mobile-only twin), regardless of auth — same as before. */}
          {!isAuthed && (
            <a href="/pricing" style={primaryBtn} className="desktop-only">Build your platform →</a>
          )}
          <a href="/pricing" style={primaryBtn} className="mobile-only">Build your platform →</a>

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
            ...MODULES_NAV,
            { href: '/pricing', label: 'Pricing', sub: 'Plans, tiers, and what each includes' },
            { href: '/assess', label: 'Take the assessment →', sub: 'Check which regulations apply to you' },
          ].map(({ href, label, sub }) => (
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
              background: GRAD,
              color: '#fff', textDecoration: 'none',
            }}>Build your platform →</a>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 1100px) {
          .desktop-nav { display: none !important; }
          .desktop-only { display: none !important; }
          .hamburger { display: flex !important; }
        }
        @media (min-width: 1101px) {
          .mobile-only { display: none !important; }
        }
      `}</style>
    </>
  )
}

