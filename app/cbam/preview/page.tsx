// app/cbam/preview/page.tsx
// Public, no-auth marketing "sample report" — a curated, COMPLETE CBAM §1.2
// Specific Embedded Emissions summary for an ILLUSTRATIVE iron & steel
// installation. Self-contained and static: no fetch, no auth, no import from
// the live verifier renderer (app/verify-cbam/[token]/page.tsx is untouched).
// All figures are hardcoded, illustrative, and numerically coherent
// (per-process × activity level sums to the installation totals shown).
import Nav from '../../components/Nav'
import Footer from '@/app/components/Footer'

// ── Palette (matches app/cbam/page.tsx) ──
const ink = '#0d0d0d'
const muted = '#555553'
const faint = '#888784'
const canvas = '#f8f7f5'
const hair = '#e8e7e4'
const violet = '#7425e3'
const green = '#0F6E56'

// ── Illustrative sample data — a plausible non-EU steel installation ──
const SAMPLE = {
  installationName: 'Northern Steel Works',
  reportingPeriod: 2026,
  operator: {
    name: 'Northern Steel Ltd.',
    registrationNo: '874203915 RC0001',
    address: '199 Bay Street, Suite 4000, Toronto, ON M5L 1A9, Canada',
  },
  installation: {
    cbamRegistryId: 'CBAM-CA-000-739184',
    unLocode: 'CA HAM',
    address: '500 Gage Avenue North, Hamilton, ON L8H 5N1, Canada',
    coordinates: '43.2557, -79.8711',
    country: 'Canada',
  },
  // Two processes at CN 7206 10 00 (semi-finished carbon steel), different EAF feedstocks.
  goods: [
    {
      process: 'EAF · scrap',
      route: 'eaf_scrap',
      cnCode: '7206 10 00',
      grade: 'Carbon steel',
      activityLevel: 120000,       // tonnes
      specificDirect: 0.117,       // tCO2e / t
      specificIndirect: 0,         // Annex II good — indirect not applicable (see_indirect = 0)
      defaultShareDirect: 0.0,     // fully actual
      benchmarkValue: 0.027,       // Column A, indicator (E) scrap/EAF
      benchmarkIndicator: 'E',
    },
    {
      process: 'EAF · DRI',
      route: 'eaf_dri',
      cnCode: '7206 10 00',
      grade: 'Carbon steel',
      activityLevel: 80000,        // tonnes
      specificDirect: 1.575,       // tCO2e / t
      specificIndirect: 0,         // Annex II good — indirect not applicable (see_indirect = 0)
      defaultShareDirect: 0.12,    // 12% of the direct figure used a default (DRI precursor)
      benchmarkValue: 0.027,       // Column A, indicator (D) DRI/EAF
      benchmarkIndicator: 'D',
    },
  ],
  defaultPrecursor: {
    cnCode: '7203 10 00',
    name: 'Direct reduced iron (DRI)',
    originCountry: 'India',
    defaultValue: 1.850,           // tCO2e / t
  },
  actualPrecursor: {
    cnCode: '7201 10 00',
    name: 'Pig iron',
    originCountry: 'Türkiye',
    reportingPeriod: 2026,
    specificDirect: 1.420,         // tCO2e / t
    specificIndirect: 0,           // Annex II good (pig iron) — indirect not applicable
    originOperator: 'Anatolia Iron A.Ş.',
    originInstallation: 'Anatolia Blast Furnace No. 2',
    originRegistryId: 'CBAM-TR-000-118273',
  },
}

// Illustrative evidence files. The SAME list appears twice — as the "input"
// (Attach evidence band, before the report) and as linked provenance in the
// report's Source documents section — to show the input→output loop. All
// illustrative; no real files.
const SAMPLE_DOCS = [
  { file: 'Weighbridge tickets — Q1 2026.pdf', type: 'Production log', meta: '1.2 MB' },
  { file: 'Natural gas invoice — Jan 2026.pdf', type: 'Fuel / energy', meta: '340 KB' },
  { file: 'Scrap steel delivery notes — 2026.pdf', type: 'Input material', meta: '890 KB' },
  { file: 'Electricity bill — Q1 2026.pdf', type: 'Energy', meta: '210 KB' },
]

// Derived totals — computed here so the arithmetic is demonstrably consistent.
const perProcess = SAMPLE.goods.map((g) => ({
  process: g.process,
  totalDirect: g.specificDirect * g.activityLevel,
}))
const installationDirectTotal = perProcess.reduce((s, p) => s + p.totalDirect, 0)   // 140,040

// The not_applicable reason the real §1.2 report renders for an Annex II good's
// indirect fields (lib/cbam/report/build.ts ANNEX_II_REASON) — steel is direct-only,
// so see_indirect = 0 and item (4)(c) / (6) resolve to not_applicable, not a number.
const ANNEX_II_REASON = 'Annex II good — direct emissions only'

const n0 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })
const n3 = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const pct = (v: number) => `${(v * 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}%`

// ── Small presentational helpers (bespoke to this page) ──
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12, padding: '8px 0', borderBottom: `0.5px solid ${hair}`, fontSize: 13, alignItems: 'baseline' }}>
      <div style={{ color: faint }}>{label}</div>
      <div style={{ color: ink }}>{children}</div>
    </div>
  )
}
function ItemSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: '0.75rem' }}>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: violet }}>{n}</span>
        <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: ink }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}
const cardStyle: React.CSSProperties = { background: '#fff', border: `0.5px solid ${hair}`, borderRadius: 10, padding: '14px 18px', marginBottom: 12 }

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: ink }}>
      <Nav />

      {/* SAMPLE FRAMING — unmistakable that this is illustrative */}
      <section style={{ padding: '4rem 2.5rem 2.5rem', borderBottom: `0.5px solid ${hair}`, background: canvas }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: violet, background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.25)', borderRadius: 99, padding: '4px 12px', marginBottom: 16 }}>Sample report · Illustrative example</span>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1rem', color: ink }}>
            What your verified CBAM report looks like
          </h1>
          <p style={{ fontSize: 15, color: muted, lineHeight: 1.75, fontWeight: 300, maxWidth: 620 }}>
            A sample CBAM Specific Embedded Emissions summary for an illustrative iron & steel installation — the verified report you share with your EU customers. Figures are illustrative — this is not real data.
          </p>
        </div>
      </section>

      {/* ATTACH EVIDENCE — static illustration of the input step. NOT an uploader:
          no dropzone, no file picker, no buttons — just a displayed list. */}
      <section style={{ padding: '3rem 2.5rem', borderBottom: `0.5px solid ${hair}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint }}>Step 1 · Attach evidence</span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, background: canvas, border: `0.5px solid ${hair}`, borderRadius: 99, padding: '2px 8px' }}>Illustration — not an uploader</span>
          </div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 400, color: ink, marginBottom: 6 }}>Every figure starts with a record.</h2>
          <p style={{ fontSize: 14, color: muted, fontWeight: 300, lineHeight: 1.7, maxWidth: 620, marginBottom: '1.5rem' }}>You attach the evidence behind each number — we keep the link, so every figure in the report below traces straight back to its source document.</p>
          <div style={{ border: `0.5px solid ${hair}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: canvas, borderBottom: `0.5px solid ${hair}`, padding: '10px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: faint }}>Evidence attached · illustrative</div>
            {SAMPLE_DOCS.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < SAMPLE_DOCS.length - 1 ? `0.5px solid ${hair}` : 'none', background: '#fff' }}>
                <span aria-hidden style={{ fontSize: 14, color: faint, flexShrink: 0 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: ink }}>{d.file}</div>
                  <div style={{ fontSize: 11, color: faint, marginTop: 2 }}>{d.type} · {d.meta}</div>
                </div>
                <span style={{ fontSize: 11, color: green, flexShrink: 0 }}>✓ Linked</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE REPORT */}
      <section style={{ padding: '3rem 2.5rem 4rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* Report header */}
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint, marginBottom: 8 }}>CBAM §1.2 · Specific Embedded Emissions summary</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, color: ink, marginBottom: 4 }}>
            {SAMPLE.installationName} · {SAMPLE.reportingPeriod}
          </h2>
          <p style={{ fontSize: 14, color: muted, fontWeight: 300, marginBottom: '1.5rem' }}>Iron & steel · {SAMPLE.installation.country} · reporting period {SAMPLE.reportingPeriod}</p>

          {/* Coverage — the complete-and-backed signal */}
          <div style={{ background: '#E1F5EE', border: `0.5px solid ${green}33`, borderRadius: 10, padding: '10px 16px', marginBottom: '2.5rem', fontSize: 13, color: green, fontWeight: 500 }}>
            All processes backed by computed records.
          </div>

          {/* (1) Operator */}
          <ItemSection n="(1)" title="Operator">
            <Row label="(1)(a) Name">{SAMPLE.operator.name}</Row>
            <Row label="(1)(b) Registration number">{SAMPLE.operator.registrationNo}</Row>
            <Row label="(1)(c) Address (English)">{SAMPLE.operator.address}</Row>
          </ItemSection>

          {/* (2) Installation */}
          <ItemSection n="(2)" title="Installation">
            <Row label="(2)(a) Name">{SAMPLE.installationName}</Row>
            <Row label="(2)(b) CBAM Registry installation ID">{SAMPLE.installation.cbamRegistryId}</Row>
            <Row label="(2)(c) UN/LOCODE">{SAMPLE.installation.unLocode}</Row>
            <Row label="(2)(d) Address (English)">{SAMPLE.installation.address}</Row>
            <Row label="(2)(e) Main-source coordinates">{SAMPLE.installation.coordinates}</Row>
          </ItemSection>

          {/* (3) Production processes */}
          <ItemSection n="(3)" title="Production processes & routes">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: ink }}>
                    {['Process', 'Production route', 'Goods (CN)', 'Grade'].map((h) => (
                      <th key={h} style={{ color: '#fff', textAlign: 'left', padding: '8px 12px', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE.goods.map((g, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : canvas, borderBottom: `0.5px solid ${hair}` }}>
                      <td style={{ padding: '8px 12px', color: muted }}>{g.process}</td>
                      <td style={{ padding: '8px 12px', color: muted }}>{g.route}</td>
                      <td style={{ padding: '8px 12px', color: ink }}>{g.cnCode}</td>
                      <td style={{ padding: '8px 12px', color: muted }}>{g.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ItemSection>

          {/* (4) Per-good embedded emissions — the core numbers */}
          <ItemSection n="(4)" title="Per-good embedded emissions">
            {SAMPLE.goods.map((g, i) => (
              <div key={i} style={cardStyle}>
                <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 12 }}>
                  Good {g.cnCode} <span style={{ fontWeight: 400, color: faint }}>· {g.process} · {n0(g.activityLevel)} t produced</span>
                </div>

                {/* SEE RESULT — the headline figure the block builds to. Direct intensity
                    only: for an Annex II good, indirect is reported separately and is not
                    part of the certificate obligation (matches the engine + §1.2 report). */}
                <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: violet, marginBottom: 4 }}>Specific embedded emissions (SEE)</div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.9rem', fontWeight: 400, color: ink, lineHeight: 1 }}>{n3(g.specificDirect)} <span style={{ fontSize: 13, color: faint }}>tCO₂e / tonne</span></div>
                  <div style={{ fontSize: 12, color: muted, marginTop: 10, lineHeight: 1.55 }}>
                    Indirect emissions: not applicable — Annex II good, direct emissions only.
                  </div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, marginBottom: 4 }}>Derived from</div>
                <Row label="(4)(a) Specific direct (tCO₂e/t)">{n3(g.specificDirect)}</Row>
                <Row label="(4)(c) Specific indirect"><span style={{ color: faint, fontStyle: 'italic' }}>{ANNEX_II_REASON}</span></Row>
                <Row label="(4)(b) Share determined with default values">{g.defaultShareDirect === 0 ? '0% — fully actual' : pct(g.defaultShareDirect)}</Row>
                <Row label="(4)(f) Benchmark used (Column A)">{n3(g.benchmarkValue)} <span style={{ color: faint, fontSize: 11 }}>· indicator ({g.benchmarkIndicator}) · IR 2025/2620 §5.3</span></Row>
                <Row label="(4)(e) Specific embedded free allocation (SEFA)"><span style={{ color: muted }}>Pending — CSCF not yet published by the Commission (Art. 14(6) Del. Reg. 2019/331)</span></Row>
              </div>
            ))}
          </ItemSection>

          {/* (5) Total direct emissions */}
          <ItemSection n="(5)" title="Total direct emissions">
            {perProcess.map((p, i) => (
              <Row key={i} label={`${p.process} (tCO₂e)`}>{n0(p.totalDirect)}</Row>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12, padding: '10px 0', fontSize: 13, alignItems: 'baseline', marginTop: 2 }}>
              <div style={{ color: ink, fontWeight: 600 }}>Installation total (tCO₂e)</div>
              <div style={{ color: violet, fontWeight: 600 }}>{n0(installationDirectTotal)}</div>
            </div>
          </ItemSection>

          {/* (6) Installation indirect emissions */}
          <ItemSection n="(6)" title="Installation indirect emissions">
            <Row label="Installation indirect"><span style={{ color: faint, fontStyle: 'italic' }}>{ANNEX_II_REASON}</span></Row>
          </ItemSection>

          {/* (12) Default-value precursor */}
          <ItemSection n="(12)" title="Precursor — default values">
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 8 }}>{SAMPLE.defaultPrecursor.cnCode} · {SAMPLE.defaultPrecursor.name}</div>
              <Row label="(12)(c) Country of origin">{SAMPLE.defaultPrecursor.originCountry}</Row>
              <Row label="(12)(d) Default value (tCO₂e/t)">{n3(SAMPLE.defaultPrecursor.defaultValue)} <span style={{ color: faint, fontSize: 11 }}>· IR 2025/2621 Annex I</span></Row>
            </div>
          </ItemSection>

          {/* (13) Actual-value precursor + origin (traceability) */}
          <ItemSection n="(13)" title="Precursor — actual values">
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 8 }}>{SAMPLE.actualPrecursor.cnCode} · {SAMPLE.actualPrecursor.name}</div>
              <Row label="(13)(c) Country of origin">{SAMPLE.actualPrecursor.originCountry}</Row>
              <Row label="(13)(d) Reporting period">{SAMPLE.actualPrecursor.reportingPeriod}</Row>
              <Row label="(13)(e) Specific direct (tCO₂e/t)">{n3(SAMPLE.actualPrecursor.specificDirect)}</Row>
              <Row label="(13)(e) Specific indirect"><span style={{ color: faint, fontStyle: 'italic' }}>{ANNEX_II_REASON}</span></Row>
              <Row label="Origin operator">{SAMPLE.actualPrecursor.originOperator}</Row>
              <Row label="Origin installation">{SAMPLE.actualPrecursor.originInstallation}</Row>
              <Row label="Origin CBAM Registry ID">{SAMPLE.actualPrecursor.originRegistryId}</Row>
            </div>
          </ItemSection>

          {/* Source documents — the "output" half: the SAME attached docs as linked
              provenance. Static list, matching the verifier report's doc section but
              with NO live "View" buttons / signed URLs. */}
          <div style={{ marginBottom: '2.25rem' }}>
            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: ink, marginBottom: '0.75rem' }}>Source documents</h3>
            <p style={{ fontSize: 13, color: muted, fontWeight: 300, lineHeight: 1.6, marginBottom: '1rem' }}>Each figure traces back to the records you attached.</p>
            {SAMPLE_DOCS.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: `0.5px solid ${hair}`, borderRadius: 10, padding: '12px 16px', marginBottom: 8, flexWrap: 'wrap' as const }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: ink }}>{d.file}</div>
                  <div style={{ fontSize: 11, color: faint, marginTop: 2 }}>{d.type}</div>
                </div>
                <span style={{ fontSize: 11, color: faint, flexShrink: 0 }}>PDF · {d.meta}</span>
              </div>
            ))}
          </div>

          {/* Provenance note */}
          <div style={{ marginTop: '1rem', padding: '1rem 1.25rem', background: canvas, border: `0.5px solid ${hair}`, borderRadius: 10, fontSize: 11, color: faint, lineHeight: 1.6 }}>
            Illustrative sample. Every figure a real report shows is sourced, traceable, and computed under the CBAM implementing regulations (Regulation (EU) 2023/956 · IR 2025/2547 · 2025/2620 · 2025/2621), ready for independent review by an accredited verifier (EN ISO/IEC 14065). This page contains no real installation data and no real documents — the evidence files shown are illustrative.
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: canvas, borderTop: `0.5px solid ${hair}`, padding: '5rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2, color: ink }}>
          Give your EU customers a verified report like this.
        </h2>
        <p style={{ fontSize: 15, color: muted, maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          Installation-level actuals, sourced and verifier-ready — instead of the worst-case default that prices your goods out.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/pricing?modules=cbam" style={{ ...btnPrimary, textDecoration: 'none' }}>See CBAM pricing →</a>
          <a href="/cbam" style={{ ...btnSecondary, textDecoration: 'none' }}>Back to CBAM overview</a>
        </div>
      </section>

      <Footer />

      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
