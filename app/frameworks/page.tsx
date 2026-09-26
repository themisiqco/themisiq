'use client'
import Nav from '@/app/components/Nav'
import Footer from '@/app/components/Footer'
import { SB253_POSTURE, SB253_PROGRAMME_URL, SB253_STATUTE, SB253_SCOPE3_FROM } from '@/lib/sb253'
import {
  CS3D_APPLIES_FROM, CS3D_TRANSPOSITION, CS3D_CITATION, CS3D_OMNIBUS_CITATION,
  CS3D_EMPLOYEE_THRESHOLD, CS3D_TURNOVER_THRESHOLD,
} from '@/lib/cs3d'
import { SB261_CITATION, SB261_DOCKET_URL, SB261_TABLE_STATUS } from '@/lib/sb261'
import { groupHeading, pageTitle as h1 } from '@/app/components/headingStyles'
import {
  CA_PAY_DATA_URL,
  CDP_URL,
  CS3D_COMMISSION_URL,
  CBAM_REGULATION_URL,
  CBAM_COMMISSION_URL,
  DORA_REGULATION_URL,
  ISO_14064_3_URL,
  SECR_GUIDANCE_URL,
  ECOVADIS_URL,
  EFRAG_HOME_URL,
  EU_AI_ACT_URL,
  GHG_PROTOCOL_URL,
  GRI_HOME_URL,
  IFRS_S2_STANDARD_URL,
  ISO_27001_URL,
  ISO_42001_URL,
  NIS2_COMMISSION_URL,
  NIST_AI_RMF_URL,
  NIST_CSF_URL,
  SBTI_URL,
  TCFD_URL,
} from '@/lib/sources'

// ── DATA ──────────────────────────────────────────────────────────
// NOTE: The "maps" lines below describe how ThemisIQ reports relate to each
// framework. Review and confirm every one of these claims (and the outbound
// URLs) before this page goes live — these are compliance statements you own.
/**
 * ⚠️ ORDERED BY HOW LIKELY THE READER IS CAUGHT, MOST FIRST. That rule is written down because the
 * order was previously implicit, and an implicit order makes every insertion arbitrary: when two groups
 * were added on 25 Sep 2026 there was no way to tell whether they belonged at the end or in the middle.
 * Climate reaches the most companies; border carbon reaches few but absolutely; supply chain reaches
 * most companies INDIRECTLY, through a customer, which is the commonest route in. Cyber and AI are last
 * because they are narrower, not because they matter less.
 * ⚠️ NOT ORDERED BY GROUP SIZE. That would put Cyber above Supply Chain, and a reader does not care how
 * many standards are in a bucket.
 *
 * ⚠️ HEADINGS ARE SENTENCE CASE WITH "and", NOT TITLE CASE WITH "&". Normalised 25 Sep 2026: four
 * headings read "Climate & Emissions" and the two new ones read "Border carbon and trade", which would
 * have put both conventions side by side on one page.
 *
 * `covers` IS AN ARRAY because one entry needs two module links — see CSRD and ESRS. A single-element
 * array with no label renders as "How we cover it"; two or more render with their labels.
 */
/**
 * Declared types rather than inferred ones, for two reasons found while adding the CSRD entry's second
 * link: inference widened `covers` to a union where `label` existed on one arm and not the other, so
 * `c.label` did not compile; and an explicit Item makes a forgotten `maps` or `href` a compile error
 * rather than a card that renders with a gap in it.
 */
type Cover = { href: string; label?: string }
type Item = { name: string; body: string; maps: string; href: string; covers: Cover[] }
type Group = { heading: string; intro: string; items: Item[] }

const groups: Group[] = [
  {
    heading: 'Climate and emissions',
    intro: 'Built on the GHG Protocol and structured for the major climate-disclosure regimes.',
    items: [
      { name: 'GHG Protocol Corporate Standard', body: 'The global accounting standard for corporate greenhouse-gas inventories.', maps: 'Your Scope 1, 2 and 3 inventory is built on the GHG Protocol Corporate Standard, audit-trail first.', href: GHG_PROTOCOL_URL, covers: [{ href: '/climate-ghg' }] },
      // ⚠️ A SEPARATE STANDARD FROM THE CORPORATE STANDARD ABOVE, not a section of it. The Corporate
      // Standard governs the inventory; the Scope 3 Standard governs value-chain accounting and its
      // fifteen categories, and the two were published eleven years apart. Listing only the first
      // implied Scope 3 came free with it.
      { name: 'GHG Protocol Scope 3 Standard', body: 'The corporate value-chain standard, covering the fifteen Scope 3 categories and the methods permitted for each.', maps: 'Category 1 takes supplier-reported figures with their basis and assurance status recorded, so a verifier can see which figures are primary data and which are not.', href: GHG_PROTOCOL_URL, covers: [{ href: '/climate-ghg' }] },
      // ⚠️ SCOPE 1+2 AND SCOPE 3 DO NOT BEGIN IN THE SAME YEAR, and the card said "Scope 1-3" as though
      // they did. SB253_SCOPE3_FROM existed and was unused here. Compressing two deadlines into one is
      // how a reader ends up preparing for the wrong date.
      { name: 'California SB 253', body: `Climate Corporate Data Accountability Act — mandatory Scope 1 and 2 disclosure, with Scope 3 following from ${SB253_SCOPE3_FROM}. ${SB253_STATUTE}. Reporting has not begun: ${SB253_POSTURE}.`, maps: 'One-click, pre-filled SB 253 emissions export from your GHG inventory.', href: SB253_PROGRAMME_URL, covers: [{ href: '/climate-ghg' }] },
      { name: 'California SB 261', body: `Climate-Related Financial Risk Act — biennial climate risk reporting aligned to TCFD. ${SB261_CITATION}. ${SB261_TABLE_STATUS}.`, maps: 'TCFD-aligned climate financial-risk report ready for SB 261 filers.', href: SB261_DOCKET_URL, covers: [{ href: '/climate-risk' }] },
      { name: 'IFRS S2', body: 'The ISSB global baseline for climate-related financial disclosures.', maps: 'Climate disclosures structured to the IFRS S2 / ISSB requirements.', href: IFRS_S2_STANDARD_URL, covers: [{ href: '/climate-risk' }] },
      { name: 'ESRS E1', body: 'The climate-change standard within the EU\u2019s CSRD reporting framework.', maps: 'ESRS E1 climate datapoints mapped directly from your GHG inventory.', href: EFRAG_HOME_URL, covers: [{ href: '/climate-ghg' }] },
      { name: 'CDP', body: 'The global environmental disclosure system used by investors and buyers.', maps: 'Export-ready answers for CDP Climate, including the C6 emissions module.', href: CDP_URL, covers: [{ href: '/climate-ghg' }] },
      { name: 'TCFD', body: 'The Task Force recommendations now consolidated under the ISSB.', maps: 'Governance, strategy, risk and metrics organized along the four TCFD pillars.', href: TCFD_URL, covers: [{ href: '/climate-risk' }] },
      // SBTi is part of the GHG module rather than a module of its own, and the maps line now says so —
      // the mapping was already /climate-ghg and read as though it might be somewhere else.
      { name: 'SBTi', body: 'Science Based Targets initiative — corporate emissions-reduction target setting.', maps: 'Part of the GHG module, not a separate one: targets are set and tracked against the inventory you have already built, under the Corporate Net-Zero Standard.', href: SBTI_URL, covers: [{ href: '/climate-ghg' }] },
    ],
  },
  {
    heading: 'Border carbon and trade',
    intro: 'Emissions embedded in goods, declared at the border by the importer.',
    items: [
      { name: 'EU CBAM', body: 'Regulation (EU) 2023/956 — the Carbon Border Adjustment Mechanism. Embedded emissions for goods entering the EU, declared by the importer, who needs the figures from the producer.', maps: 'Installation-level direct and indirect emissions with an Annex IV summary and a verifier portal.', href: CBAM_REGULATION_URL, covers: [{ href: '/cbam' }] },
      { name: 'CBAM Annex IV', body: 'The reporting format for specific embedded emissions per good.', maps: 'Generated from your installation data and exported to XLSX.', href: CBAM_REGULATION_URL, covers: [{ href: '/cbam' }] },
      { name: 'CBAM implementing regulations', body: 'The sector rules and default values behind steel, aluminium, cement and fertiliser.', maps: 'Per-country sector defaults and the boundary guidance applied to your installations.', href: CBAM_COMMISSION_URL, covers: [{ href: '/cbam' }] },
    ],
  },
  {
    heading: 'Supply chain and due diligence',
    intro: 'Value-chain emissions, supplier data and human-rights risk.',
    items: [
      // ⚠️ "EU CS3D", not "CSDDD". Every other surface — lib/cs3d.ts, app/supply-chain/page.tsx, the
      // homepage chips, OBLIGATIONS.cs3d — says CS3D; this card was the only holdout.
      //
      // ⚠️ THIS CARD SAYS NOTHING ABOUT CIVIL LIABILITY, AND THAT SILENCE IS THE POSITION. It is carried
      // verbatim from app/supply-chain/page.tsx, whose comment reads: (EU) 2026/470 is UNDERSTOOD to have
      // deleted the EU-wide civil liability regime and reverted it to national law, but that rests on
      // secondary sources — nobody here has read the amended article on EUR-Lex. Removing an over-claim
      // on a secondary source is safe in a way that adding one is not, so the page neither threatens the
      // reader with liability nor tells them it is gone. A framework reference page must not assert more
      // than the module page does. docs/backlog.md carries it as pending verification.
      //
      // ⚠️ THE OBLIGATION IS THE CUSTOMER'S, NOT THE READER'S, and the body has to say so. A single tier
      // at more than 5,000 employees and EUR 1.5bn catches very few companies; what reaches everyone
      // else is the questionnaire.
      { name: 'EU CS3D', body: `The Corporate Sustainability Due Diligence Directive on value-chain human rights and environmental impacts. ${CS3D_CITATION}. Since ${CS3D_OMNIBUS_CITATION} there is a single scope tier: an EU company is caught only with ${CS3D_EMPLOYEE_THRESHOLD} and ${CS3D_TURNOVER_THRESHOLD}. Member States transpose by ${CS3D_TRANSPOSITION} and obligations apply from ${CS3D_APPLIES_FROM}. Almost certainly your customer is in scope and you are not — what reaches you is their request.`, maps: 'Structured human rights and environmental questionnaires you answer once and reuse for every customer that asks, plus the same collection from your own suppliers.', href: CS3D_COMMISSION_URL, covers: [{ href: '/supply-chain' }] },
      { name: 'ESRS S2', body: 'Workers in the value chain — the CSRD standard for upstream/downstream labour impacts.', maps: 'Workers-in-the-value-chain disclosures from your supplier data.', href: EFRAG_HOME_URL, covers: [{ href: '/supply-chain' }] },
      { name: 'EcoVadis', body: 'Business sustainability ratings used across supply chains.', maps: 'Evidence and scoring organized for EcoVadis assessments.', href: ECOVADIS_URL, covers: [{ href: '/supply-chain' }] },
    ],
  },
  {
    heading: 'Corporate sustainability reporting',
    intro: 'Double materiality and the disclosure standards behind EU and global ESG reporting.',
    items: [
      // ⚠️ TWO LINKS, BECAUSE CSRD REPORTING GENUINELY NEEDS BOTH MODULES. Materiality covers the impact
      // half of double materiality, Climate Risk the financial half. Pointing at Materiality alone told
      // a CSRD reporter they had what they needed when they had half of it.
      { name: 'CSRD and ESRS', body: 'The EU Corporate Sustainability Reporting Directive and its European Sustainability Reporting Standards.', maps: 'Double materiality across both halves: Materiality assesses impact, Climate Risk assesses financial. CSRD reporting needs both, plus ESRS datapoints across the topical standards.', href: EFRAG_HOME_URL, covers: [{ href: '/materiality', label: 'Materiality \u2192' }, { href: '/climate-risk', label: 'Climate Risk \u2192' }] },
      // ⚠️ GRI UNIVERSAL IS NOT A WORKFORCE STANDARD. It pointed at /people, which is true only of the
      // 400 series, listed separately under People and workforce. GRI 1, 2 and 3 are general reporting
      // principles, disclosures and material-topic determination.
      { name: 'GRI Universal Standards', body: 'GRI 1, 2 and 3 — the reporting principles, general disclosures and material-topic determination underlying every GRI report.', maps: 'General disclosures and material-topic determination generated from your data. The GRI 400 social series is covered separately by People and Workforce.', href: GRI_HOME_URL, covers: [{ href: '/climate-ghg' }] },
      // ⚠️ IN THIS GROUP "FOR NOW". ISO 14064-3 is a verification standard rather than a reporting one,
      // and it sits here because the page has no assurance group yet. If one is added, this moves.
      { name: 'ISO 14064-3', body: 'The international standard for validation and verification of greenhouse gas statements — what an assurance provider works to.', maps: 'The assurance pack and the verifier portal are assembled for ISO 14064-3 engagements.', href: ISO_14064_3_URL, covers: [{ href: '/climate-ghg' }] },
    ],
  },
  {
    heading: 'Thresholds and transactions',
    intro: 'Whether a company is caught at all, tested against a target, a portfolio company or yourself.',
    items: [
      { name: 'UK SECR', body: 'Streamlined Energy and Carbon Reporting. Caught by a two-of-three test on turnover, balance sheet total and employees.', maps: 'The threshold engine tests each limb, with FX conversion and near-threshold banding, so a company close to a limit is flagged rather than silently in or out.', href: SECR_GUIDANCE_URL, covers: [{ href: '/deals' }] },
      { name: 'CSRD thresholds', body: 'Who is caught after the Omnibus amendments, and from which financial year.', maps: 'Tested against a target or a portfolio company, with the result in an IC-ready pack.', href: EFRAG_HOME_URL, covers: [{ href: '/deals' }] },
    ],
  },
  {
    heading: 'People and workforce',
    intro: 'Own-workforce metrics, pay equity and human-capital disclosure.',
    items: [
      { name: 'ESRS S1', body: 'Own workforce — the CSRD standard covering your direct employees.', maps: 'Headcount, DEI, health & safety and pay metrics mapped to ESRS S1.', href: EFRAG_HOME_URL, covers: [{ href: '/people' }] },
      { name: 'GRI 400 series', body: 'GRI social topic standards (401\u2013410) on employment, labour and diversity.', maps: 'Employment, labour-relations and diversity disclosures.', href: GRI_HOME_URL, covers: [{ href: '/people' }] },
      { name: 'Pay Transparency', body: 'Emerging gender pay-gap and pay-data reporting requirements (EU Pay Transparency Directive, CA pay data).', maps: 'Gender pay-gap analysis and California pay-data reporting support.', href: CA_PAY_DATA_URL, covers: [{ href: '/people' }] },
    ],
  },
  {
    heading: 'AI governance',
    intro: 'Risk classification, model inventory and AI management systems.',
    items: [
      { name: 'EU AI Act', body: 'The EU\u2019s risk-based regulation of artificial-intelligence systems.', maps: 'Risk classification and conformity-readiness across your AI systems.', href: EU_AI_ACT_URL, covers: [{ href: '/ai-governance' }] },
      { name: 'NIST AI RMF', body: 'The NIST AI Risk Management Framework (Govern, Map, Measure, Manage).', maps: 'Govern / Map / Measure / Manage applied across your model inventory.', href: NIST_AI_RMF_URL, covers: [{ href: '/ai-governance' }] },
      { name: 'ISO/IEC 42001', body: 'The international standard for AI management systems.', maps: 'AI management-system controls and documentation.', href: ISO_42001_URL, covers: [{ href: '/ai-governance' }] },
    ],
  },
  {
    heading: 'Cyber governance',
    intro: 'Security posture, ICT resilience and incident management.',
    items: [
      // ⚠️ SIX FUNCTIONS. The body listed five, omitting Govern, while the maps line beside it said six
      // and app/cyber/page.tsx:191 says '✓ Full — Govern, Identify, Protect, Detect, Respond, Recover'.
      // CSF 2.0 added Govern; a reader who counted the body got a different number from the same card.
      { name: 'NIST CSF', body: 'The NIST Cybersecurity Framework 2.0 (Govern, Identify, Protect, Detect, Respond, Recover).', maps: 'Posture tracking across all six CSF functions.', href: NIST_CSF_URL, covers: [{ href: '/cyber' }] },
      { name: 'ISO/IEC 27001', body: 'The international standard for information-security management systems.', maps: 'ISMS controls and a maintained Statement of Applicability.', href: ISO_27001_URL, covers: [{ href: '/cyber' }] },
      { name: 'NIS2', body: 'The EU directive raising cybersecurity requirements across essential sectors.', maps: 'Risk-management measures and incident-reporting workflows.', href: NIS2_COMMISSION_URL, covers: [{ href: '/cyber' }] },
      { name: 'DORA', body: 'The EU Digital Operational Resilience Act for financial entities.', maps: 'ICT risk and operational-resilience controls for financial entities.', href: DORA_REGULATION_URL, covers: [{ href: '/cyber' }] },
    ],
  },
]

// ── STYLES ────────────────────────────────────────────────────────
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 12 }
const lede: React.CSSProperties = { fontSize: 17, color: '#555553', lineHeight: 1.7, fontWeight: 400, maxWidth: 620 }
/**
 * The emphasised span in the h1. ⚠️ WAS CALLED `grad`, AND THERE IS NO GRADIENT IN IT — the name is a
 * fossil of the retired brand gradient, which CLAUDE.md records as gone. A style called `grad` reads as
 * permission to put one back. app/page.tsx carried the same fossil under the name `gradText` and it was
 * removed on 25 Sep 2026; this is the twin.
 */
const emBrand: React.CSSProperties = { fontStyle: 'italic', color: 'var(--color-brand)' }
const groupIntro: React.CSSProperties = { fontSize: 14, color: 'var(--color-ink-muted)', fontWeight: 400, marginBottom: '1.75rem', maxWidth: 560, lineHeight: 1.6 }
const card: React.CSSProperties = { border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem 1.5rem 1.25rem', background: '#fff', display: 'flex', flexDirection: 'column' }
const fwName: React.CSSProperties = { fontSize: 16, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }
const fwBody: React.CSSProperties = { fontSize: 13.5, color: '#555553', lineHeight: 1.6, fontWeight: 400, marginBottom: 12 }
const fwMaps: React.CSSProperties = { fontSize: 13, color: '#0d0d0d', lineHeight: 1.55, fontWeight: 400, paddingTop: 12, borderTop: '0.5px solid #f0efed', marginBottom: 14 }
const linkRow: React.CSSProperties = { marginTop: 'auto', display: 'flex', gap: 16, alignItems: 'center' }
const fwLink: React.CSSProperties = { fontSize: 12.5, color: '#555553', textDecoration: 'none', fontWeight: 500 }

export default function Frameworks() {
  return (
    <div style={{ background: '#fff', color: '#0d0d0d', minHeight: '100vh' }}>
      <Nav />

      {/* HERO */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '5rem 2.5rem 3rem' }}>
        <div style={eyebrow}>Frameworks</div>
        <h1 style={h1}>The frameworks we <span style={emBrand}>support</span></h1>
        <p style={lede}>
          ThemisIQ is built on one principle: collect your data once, comply everywhere. The same source
          data maps across the frameworks below — from California’s SB 253 to the EU’s CSRD, from IFRS S2
          to the AI and cyber regimes — so you report under each without re-entering anything.
        </p>
      </section>

      {/* GROUPS */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '1rem 2.5rem 4rem' }}>
        {groups.map(group => (
          <div key={group.heading} style={{ marginBottom: '3.5rem' }}>
            <h2 style={groupHeading}>{group.heading}</h2>
            <p style={groupIntro}>{group.intro}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
              {group.items.map(item => (
                <div key={item.name} style={card}>
                  <div style={fwName}>{item.name}</div>
                  <div style={fwBody}>{item.body}</div>
                  <div style={fwMaps}>{item.maps}</div>
                  <div style={linkRow}>
                    {/* One unlabelled target reads "How we cover it"; two or more read their own labels,
                        because "How we cover it" twice would not tell you which was which. */}
                    {item.covers.length === 1 && !item.covers[0].label
                      ? <a href={item.covers[0].href} style={{ ...fwLink, color: 'var(--color-brand)' }}>How we cover it →</a>
                      : item.covers.map(c => (
                          <a key={c.href} href={c.href} style={{ ...fwLink, color: 'var(--color-brand)' }}>{c.label ?? 'How we cover it →'}</a>
                        ))}
                    <a href={item.href} target="_blank" rel="noopener noreferrer" style={fwLink}>Official source ↗</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '4rem 2.5rem', textAlign: 'center' }}>
          {/* ⚠️ NO COUNT. This read "We map to 30+ reporting frameworks", against which the page had
              twenty-three cards and ALL_OBLIGATION_IDS has sixteen — a number checkable against nothing.
              With the September 2026 additions the page reaches thirty exactly, which would be worse: a
              figure that is briefly true and stale on the next insertion. The cards above are the claim.

              ⚠️ AND NO PROMISE OF COVERAGE ON REQUEST. It used to say "Tell us what you report under and
              we'll confirm coverage", which reads as an undertaking to add it. What is true is narrower
              and more useful: most frameworks ask for figures this platform already holds, so the honest
              answer is whether your data serves it, not whether a card exists. */}
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, marginBottom: 12 }}>
            Don’t see your framework?
          </h2>
          <p style={{ fontSize: 15, color: '#555553', fontWeight: 400, maxWidth: 620, margin: '0 auto 1rem', lineHeight: 1.7 }}>
            A framework having no card above does not mean your data cannot answer it. Most of these ask
            for the same underlying figures — an inventory built to the GHG Protocol, a risk assessment
            under a named scenario, supplier data with its basis recorded — so a questionnaire nobody has
            written a card for is usually answerable from what you have already collected. That is what
            collect once, comply everywhere means in practice.
          </p>
          <p style={{ fontSize: 15, color: '#555553', fontWeight: 400, maxWidth: 620, margin: '0 auto 1.75rem', lineHeight: 1.7 }}>
            A card above means we have mapped it: the datapoints, the format and the export. Tell us what
            you report under and we will tell you whether your data already serves it. What we map next is
            driven by what customers are actually being asked for.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* /assess first: it answers "which of these applies to me", which is the question a reader
                arriving from the nav link marked Regulations is actually asking. The mailto is second
                because it needs a person at the other end. */}
            <a href="/assess" style={{ fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', textDecoration: 'none', display: 'inline-block' }}>
              Find out which apply to you
            </a>
            <a href="mailto:hello@themisiq.co" style={{ fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: 'var(--color-brand)', border: '0.5px solid var(--color-brand)', textDecoration: 'none', display: 'inline-block' }}>
              Talk to us
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
