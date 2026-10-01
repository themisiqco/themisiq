import type { Metadata } from 'next'
import Image from 'next/image'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { btnPrimary } from '@/app/components/buttonStyles'
import { pageTitle, sectionTitle } from '@/app/components/headingStyles'
import { ModuleSection, bodyCopy } from '@/app/components/modulePage'
import { AURORA_SRC, AURORA_CLOSE_POSITION } from '@/app/components/auroraBand'

export const metadata: Metadata = {
  title: 'About ThemisIQ',
  description:
    'ThemisIQ helps businesses of every size understand which sustainability rules apply to them, then produce reports they can stand behind.',
  alternates: { canonical: '/about' },
}

/**
 * The About page. The copy is Lisa's, verbatim: do not rewrite, reorder or add to it.
 *
 * ⚠️ NO NEWSLETTER BACKEND EXISTS, so "Sign up" is a mailto with a fixed subject and body, by decision
 * (1 Oct 2026). If a signup is ever built, replace NEWSLETTER_MAILTO here rather than adding a second one.
 *
 * ⚠️ THE PHOTO HAS A WHITE BACKGROUND. Its section is untinted (white) on purpose: on --color-ground or a
 * coloured fill the photo's edge would show as a white rectangle.
 *
 * ⚠️ BRAND COLOUR AS FILL ONLY. The two e-mail links are ink, underlined, not brand-coloured text.
 */

const EMAIL = 'hello@themisiq.co'
const NEWSLETTER_MAILTO =
  `mailto:${EMAIL}?subject=${encodeURIComponent('Newsletter sign-up')}&body=${encodeURIComponent('Please add me to the ThemisIQ newsletter.')}`

const emailLink = <a href={`mailto:${EMAIL}`} style={{ color: 'var(--color-ink)', textDecoration: 'underline' }}>{EMAIL}</a>
const para = { ...bodyCopy, margin: '0 0 1rem' }

const LETTER = [
  'I’ve advised businesses for more than 20 years, and for the last decade I’ve focused on sustainable and responsible business practices. I’ve worked with large multinationals and with very small teams. The reports they were asked for were different. What they needed was the same.',
  'First, they needed to know which regulations actually applied to them. Then, when a report came due, whether required by law in a country where they operate or requested by a customer, a bank or an investor, they needed one platform they could trust. That means published methodologies and an audit trail ready for their verifier. Guidance built in, with a human advisor available when they want one. Data entered once and used for every report that needs it. And pricing that works for their budget, whatever its size.',
  'As a consultant, I had a front-row seat to what my clients needed and what was missing. Over time, I could picture the platform that would meet those needs. When I couldn’t find it, I built it. Every feature in ThemisIQ traces back to a real client question, and I’m glad you’re here.',
]

export default function AboutPage() {
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid var(--color-line)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h1 style={pageTitle}>About ThemisIQ</h1>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)', lineHeight: 1.5, margin: '0 0 0.75rem', maxWidth: '62ch' }}>
            One platform for the sustainability reporting you{'’'}re asked to do.
          </p>
          <p style={{ ...bodyCopy, fontSize: 16, margin: 0 }}>
            ThemisIQ helps businesses of every size understand which sustainability rules apply to them, then produce reports they can stand behind.
          </p>
        </div>
      </section>

      <ModuleSection>
        <h2 style={sectionTitle}>From our founder</h2>
        {/* Photo and bio beside the letter on desktop; stacked above it below 760px (.tq-side-column). */}
        <div className="tq-side-column" style={{ marginTop: '1.5rem' }}>
          <div style={{ maxWidth: 280 }}>
            <Image src="/images/lisa-foster.png" alt="Lisa Foster, Founder of ThemisIQ" width={1080} height={1350}
              sizes="(max-width: 760px) 280px, 200px" style={{ width: '100%', height: 'auto', display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink)', margin: '0.75rem 0 0.4rem' }}>Lisa Foster, Founder</p>
            <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6, margin: 0 }}>
              Lisa{'’'}s background includes working with both Big 4 and boutique consultancies. She holds the prestigious FSA Credential from the IFRS Foundation and is an alumna of the LEAP program from the World Business Council for Sustainable Development, co-creator of the Greenhouse Gas Protocol. She is a guest lecturer at Canada{'’'}s top universities and a speaker at sustainability events and think tanks.
            </p>
          </div>
          <div>
            {LETTER.map(t => <p key={t.slice(0, 24)} style={para}>{t}</p>)}
          </div>
        </div>
      </ModuleSection>

      <ModuleSection tinted>
        <h2 style={sectionTitle}>Canadian roots, global clients</h2>
        <p style={{ ...bodyCopy, margin: 0 }}>ThemisIQ is a Canadian company. We work with clients around the world, wherever their reporting obligations take them.</p>
      </ModuleSection>

      <ModuleSection>
        <h2 style={sectionTitle}>Growing with partners</h2>
        <p style={{ ...bodyCopy, margin: 0 }}>We{'’'}re welcoming partners who want to bring ThemisIQ to more businesses. If you advise or serve companies that face sustainability reporting requests, we{'’'}d like to hear from you.</p>
      </ModuleSection>

      <ModuleSection tinted>
        <h2 style={sectionTitle}>What{'’'}s next</h2>
        <p style={{ ...bodyCopy, margin: 0 }}>We{'’'}re expanding our reporting capabilities, with more modules on the way. Our goal is to be your one true source for sustainability-related compliance obligations.</p>
      </ModuleSection>

      <ModuleSection>
        <h2 style={sectionTitle}>How we use AI</h2>
        <p style={para}>We use AI in one place: the GHG Emissions module. There, an AI agent reads the source documents you upload, such as utility bills, and pulls out the figures the platform needs. Your emissions are then calculated by the platform using our published methodologies, not by AI.</p>
        <p style={{ ...bodyCopy, margin: 0 }}>Prefer a person to handle this step? No problem. Just let us know at {emailLink}, and one of our team will do it instead.</p>
      </ModuleSection>

      <ModuleSection tinted>
        <h2 style={sectionTitle}>Why Themis</h2>
        <p style={para}>In early Greek myth, Themis was the Titaness of divine law and custom. Her name was understood to mean {'“'}what is laid down.{'”'} Hesiod names her as the mother of Good Order, Justice and Peace.</p>
        <p style={{ ...bodyCopy, margin: 0 }}>Themis was known for wise counsel. We share her view that peace follows good order: we help you understand what{'’'}s required, bring your data together once, and deliver reports you can stand behind.</p>
      </ModuleSection>

      <ModuleSection>
        <h2 style={sectionTitle}>Stay in touch</h2>
        <p style={{ ...para, marginBottom: '0.3rem' }}><strong style={{ color: 'var(--color-ink)' }}>Newsletter</strong></p>
        <p style={para}>Sign up for updates on the regulations that matter to your business, plus news on new module releases.</p>
        <a href={NEWSLETTER_MAILTO} style={{ ...btnPrimary, textDecoration: 'none', marginBottom: '2rem' }}>Sign up</a>
        <p style={{ ...para, marginBottom: '0.3rem' }}><strong style={{ color: 'var(--color-ink)' }}>Contact</strong></p>
        <p style={{ ...bodyCopy, margin: 0 }}>Questions, a report request, or just want to say hi? Write to us at {emailLink}.</p>
      </ModuleSection>

      {/* The closing band: the homepage's and ClosingBand's photograph, crop and wash, read from auroraBand.ts so it
          cannot drift. No buttons, so nothing sits over the bright curtains on the right; the quote is
          --color-on-dark over .tq-close-wash, heavier below 900px (.tq-close-wash-about; measurements in the token file). */}
      <section style={{ padding: '2.75rem 2.5rem', position: 'relative', overflow: 'hidden' }}>
        <Image src={AURORA_SRC} alt="" aria-hidden fill sizes="100vw" style={{ objectFit: 'cover', objectPosition: AURORA_CLOSE_POSITION }} />
        <div className="tq-close-wash tq-close-wash-about" />
        <figure style={{ maxWidth: 1180, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 'var(--gradation-ink-safe)', minWidth: 'min(100%, 28rem)' }}>
            <blockquote style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', fontWeight: 400, color: 'var(--color-on-dark)', lineHeight: 1.2, margin: 0 }}>
              Set it down once. Set it down right.
            </blockquote>
            <figcaption style={{ fontSize: 14, color: 'var(--color-on-dark)', lineHeight: 1.65, margin: '0.6rem 0 0', maxWidth: '54ch' }}>
              Inspired by Themis, whose name meant {'“'}what is laid down.{'”'}
            </figcaption>
          </div>
        </figure>
      </section>

      <Footer />
    </div>
  )
}
