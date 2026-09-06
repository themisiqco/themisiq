'use client'
// app/components/PaywallCard.tsx
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

// `title` and `body` are REQUIRED, and the defaults they used to carry are gone.
//
// THEY DEFAULTED TO CLIMATE RISK, AND THAT IS HOW A DEALS PAGE CAME TO ADVERTISE CSRD. Omitting a
// prop looked exactly like choosing it, so nothing could tell a page that MEANT Climate Risk from
// one that simply forgot — not tsc, not a test, not review. /dashboard/deals/report passed no
// props at all and told anyone opening a second deal report to "Unlock the Climate Risk module",
// naming the wrong product twice and listing three features that page does not have.
//
// Of the three sites that relied on the default, only ONE was well served by it: the other two got
// the wrong module and the wrong report respectively. A default that is right once in three uses
// is not a default. Requiring these two makes an omission a BUILD FAILURE rather than a wall that
// renders confidently and wrongly.
//
// `cta` and `href` keep their defaults on purpose: both are module-agnostic, and no call site has
// ever overridden `cta`. `href` is now passed everywhere to preselect the module on /pricing —
// see the slug note below — but a bare /pricing remains a correct fallback rather than a wrong one.
//
// ⚠️ HREF SLUGS ARE THE SHORTHAND IDS, NOT ModuleKeys. /pricing and /order both parse ?modules=
// against LEGACY_PRICING_PAGE_ID's keys: ghg · cbam · risk · supply · people · deals · ai · cyber.
// So Climate Risk is `risk` and Supply Chain is `supply`. AN UNRECOGNISED SLUG IS NOT AN ERROR —
// /pricing silently falls back to selecting GHG — so a typo here reproduces the exact defect this
// change exists to stop, just one page further along. Check a slug against that list, never guess.
export default function PaywallCard({
  title,
  body,
  cta = 'See pricing & unlock →',
  href = '/pricing',
}: { title: string; body: string; cta?: string; href?: string }) {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: '#0d0d0d', borderRadius: 16, padding: '2.5rem 2rem', maxWidth: 440, textAlign: 'center', boxShadow: '0 12px 40px rgba(13,13,13,0.18)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 14 }}>Locked</div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.6rem', color: '#fff', margin: '0 0 12px', lineHeight: 1.25 }}>{title}</h2>
        <p style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, margin: '0 0 24px' }}>{body}</p>
        <a href={href} style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>{cta}</a>
      </div>
    </div>
  )
}
