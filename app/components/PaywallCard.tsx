'use client'
// app/components/PaywallCard.tsx
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

export default function PaywallCard({
  title = 'Unlock the Climate Risk module',
  body = 'This report is part of the Climate Risk module. Unlock it to view the full double-materiality assessment, generate the CSRD / IFRS S2 report, and download it as a PDF.',
  cta = 'See pricing & unlock →',
  href = '/pricing',
}: { title?: string; body?: string; cta?: string; href?: string }) {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: '#0d0d0d', borderRadius: 16, padding: '2.5rem 2rem', maxWidth: 440, textAlign: 'center', boxShadow: '0 12px 40px rgba(13,13,13,0.18)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 14 }}>Locked</div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.6rem', color: '#fff', margin: '0 0 12px', lineHeight: 1.25 }}>{title}</h2>
        <p style={{ fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, margin: '0 0 24px' }}>{body}</p>
        <a href={href} style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>{cta}</a>
      </div>
    </div>
  )
}
