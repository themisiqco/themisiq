// What /auth/callback and /auth/confirm show while a link is being completed, and if it cannot be (LEAD1 L2).
import Link from 'next/link'
import ThemisIQLogo from '../components/ThemisIQLogo'

export default function AuthLinkStatus({ message }: { message: string | null }) {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' as const }}>
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none' }}><ThemisIQLogo size={19} /></Link>
      </nav>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ maxWidth: 420, width: '100%', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
          {message ? (
            <>
              <p role="alert" style={{ fontSize: 14, color: '#B91C1C', lineHeight: 1.6, margin: '0 0 1.25rem' }}>{message}</p>
              <a href="/login" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none' }}>Sign in →</a>
            </>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--color-ink-muted)', margin: 0 }}>Signing you in…</p>
          )}
        </div>
      </div>
    </div>
  )
}
