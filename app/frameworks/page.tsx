'use client'
import Nav from '@/app/components/Nav'
import Footer from '@/app/components/Footer'
import { SB253_POSTURE, SB253_PROGRAMME_URL, SB253_STATUTE } from '@/lib/sb253'
import { SB261_CITATION, SB261_DOCKET_URL, SB261_TABLE_STATUS } from '@/lib/sb261'
import { groupHeading, pageTitle as h1 } from '@/app/components/headingStyles'
import {
  CA_PAY_DATA_URL,
  CDP_URL,
  CS3D_COMMISSION_URL,
  DORA_COMMISSION_URL,
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
const groups = [
  {
    heading: 'Climate & Emissions',
    intro: 'Built on the GHG Protocol and structured for the major climate-disclosure regimes.',
    items: [
      { name: 'GHG Protocol', body: 'The global accounting standard for corporate greenhouse-gas inventories.', maps: 'Your Scope 1, 2 and 3 inventory is built on the GHG Protocol Corporate Standard, audit-trail first.', href: GHG_PROTOCOL_URL, module: '/climate-ghg' },
      { name: 'California SB 253', body: `Climate Corporate Data Accountability Act — mandatory Scope 1–3 disclosure. ${SB253_STATUTE}. Reporting has not begun: ${SB253_POSTURE}.`, maps: 'One-click, pre-filled SB 253 emissions export from your GHG inventory.', href: SB253_PROGRAMME_URL, module: '/climate-ghg' },
      { name: 'California SB 261', body: `Climate-Related Financial Risk Act — biennial climate risk reporting aligned to TCFD. ${SB261_CITATION}. ${SB261_TABLE_STATUS}.`, maps: 'TCFD-aligned climate financial-risk report ready for SB 261 filers.', href: SB261_DOCKET_URL, module: '/climate-risk' },
      { name: 'IFRS S2', body: 'The ISSB global baseline for climate-related financial disclosures.', maps: 'Climate disclosures structured to the IFRS S2 / ISSB requirements.', href: IFRS_S2_STANDARD_URL, module: '/climate-risk' },
      { name: 'ESRS E1', body: 'The climate-change standard within the EU’s CSRD reporting framework.', maps: 'ESRS E1 climate datapoints mapped directly from your GHG inventory.', href: EFRAG_HOME_URL, module: '/climate-ghg' },
      { name: 'CDP', body: 'The global environmental disclosure system used by investors and buyers.', maps: 'Export-ready answers for CDP Climate, including the C6 emissions module.', href: CDP_URL, module: '/climate-ghg' },
      { name: 'TCFD', body: 'The Task Force recommendations now consolidated under the ISSB.', maps: 'Governance, strategy, risk and metrics organized along the four TCFD pillars.', href: TCFD_URL, module: '/climate-risk' },
      { name: 'SBTi', body: 'Science Based Targets initiative — corporate emissions-reduction target setting.', maps: 'Track reductions against your science-based targets over time.', href: SBTI_URL, module: '/climate-ghg' },
    ],
  },
  {
    heading: 'Corporate Sustainability Reporting',
    intro: 'Double materiality and the disclosure standards behind EU and global ESG reporting.',
    items: [
      { name: 'CSRD / ESRS', body: 'The EU Corporate Sustainability Reporting Directive and its European Sustainability Reporting Standards.', maps: 'Double-materiality assessment plus ESRS datapoints across the topical standards.', href: EFRAG_HOME_URL, module: '/materiality' },
      { name: 'GRI Standards', body: 'The most widely used global standards for sustainability reporting.', maps: 'GRI Universal and topic-standard disclosures generated from your data.', href: GRI_HOME_URL, module: '/people' },
      { name: 'EcoVadis', body: 'Business sustainability ratings used across supply chains.', maps: 'Evidence and scoring organized for EcoVadis assessments.', href: ECOVADIS_URL, module: '/supply-chain' },
    ],
  },
  {
    heading: 'Supply Chain & Due Diligence',
    intro: 'Value-chain emissions, supplier data and human-rights risk.',
    items: [
      { name: 'CSDDD', body: 'The EU Corporate Sustainability Due Diligence Directive on value-chain human-rights and environmental impacts.', maps: 'Value-chain due diligence with supplier and human-rights risk mapping.', href: CS3D_COMMISSION_URL, module: '/supply-chain' },
      { name: 'ESRS S2', body: 'Workers in the value chain — the CSRD standard for upstream/downstream labour impacts.', maps: 'Workers-in-the-value-chain disclosures from your supplier data.', href: EFRAG_HOME_URL, module: '/supply-chain' },
    ],
  },
  {
    heading: 'People & Workforce',
    intro: 'Own-workforce metrics, pay equity and human-capital disclosure.',
    items: [
      { name: 'ESRS S1', body: 'Own workforce — the CSRD standard covering your direct employees.', maps: 'Headcount, DEI, health & safety and pay metrics mapped to ESRS S1.', href: EFRAG_HOME_URL, module: '/people' },
      { name: 'GRI 400 series', body: 'GRI social topic standards (401–410) on employment, labour and diversity.', maps: 'Employment, labour-relations and diversity disclosures.', href: GRI_HOME_URL, module: '/people' },
      { name: 'Pay Transparency', body: 'Emerging gender pay-gap and pay-data reporting requirements (EU Pay Transparency Directive, CA pay data).', maps: 'Gender pay-gap analysis and California pay-data reporting support.', href: CA_PAY_DATA_URL, module: '/people' },
    ],
  },
  {
    heading: 'AI Governance',
    intro: 'Risk classification, model inventory and AI management systems.',
    items: [
      { name: 'EU AI Act', body: 'The EU’s risk-based regulation of artificial-intelligence systems.', maps: 'Risk classification and conformity-readiness across your AI systems.', href: EU_AI_ACT_URL, module: '/ai-governance' },
      { name: 'NIST AI RMF', body: 'The NIST AI Risk Management Framework (Govern, Map, Measure, Manage).', maps: 'Govern / Map / Measure / Manage applied across your model inventory.', href: NIST_AI_RMF_URL, module: '/ai-governance' },
      { name: 'ISO/IEC 42001', body: 'The international standard for AI management systems.', maps: 'AI management-system controls and documentation.', href: ISO_42001_URL, module: '/ai-governance' },
    ],
  },
  {
    heading: 'Cyber Governance',
    intro: 'Security posture, ICT resilience and incident management.',
    items: [
      { name: 'NIST CSF', body: 'The NIST Cybersecurity Framework (Identify, Protect, Detect, Respond, Recover).', maps: 'Posture tracking across all six CSF functions.', href: NIST_CSF_URL, module: '/cyber' },
      { name: 'ISO/IEC 27001', body: 'The international standard for information-security management systems.', maps: 'ISMS controls and a maintained Statement of Applicability.', href: ISO_27001_URL, module: '/cyber' },
      { name: 'NIS2', body: 'The EU directive raising cybersecurity requirements across essential sectors.', maps: 'Risk-management measures and incident-reporting workflows.', href: NIS2_COMMISSION_URL, module: '/cyber' },
      { name: 'DORA', body: 'The EU Digital Operational Resilience Act for financial entities.', maps: 'ICT risk and operational-resilience controls for financial entities.', href: DORA_COMMISSION_URL, module: '/cyber' },
    ],
  },
]

// ── STYLES ────────────────────────────────────────────────────────
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 12 }
const lede: React.CSSProperties = { fontSize: 17, color: '#555553', lineHeight: 1.7, fontWeight: 400, maxWidth: 620 }
const grad: React.CSSProperties = { fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }
const groupIntro: React.CSSProperties = { fontSize: 14, color: '#888784', fontWeight: 400, marginBottom: '1.75rem', maxWidth: 560, lineHeight: 1.6 }
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
        <h1 style={h1}>The frameworks we <span style={grad}>support</span></h1>
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
                    <a href={item.module} style={{ ...fwLink, color: '#7425e3' }}>How we cover it →</a>
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
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, marginBottom: 12 }}>
            Don’t see your framework?
          </h2>
          <p style={{ fontSize: 15, color: '#555553', fontWeight: 400, maxWidth: 480, margin: '0 auto 1.75rem', lineHeight: 1.7 }}>
            We map to 30+ reporting frameworks and add more as regulations evolve. Tell us what you report under and we’ll confirm coverage.
          </p>
          <a href="mailto:hello@themisiq.co" style={{ fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', textDecoration: 'none', display: 'inline-block' }}>
            Talk to us
          </a>
        </div>
      </section>

      <Footer />
    </div>
  )
}
