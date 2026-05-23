'use client'
import Nav from '../components/Nav'

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* URGENCY BANNER */}
      <div style={{ background: '#ba7517', padding: '10px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>EU Pay Transparency Directive — member state transposition deadline: June 2026. Gender pay gap reporting mandatory for 100+ EU employees.</span>
        <a href="/dashboard/people" style={{ fontSize: 12, fontWeight: 600, color: '#fff', textDecoration: 'underline' }}>Check if this applies to you →</a>
      </div>

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={eyebrow}>People & Workforce</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              Workforce<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Intelligence</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2rem', maxWidth: 480 }}>
              Human capital reporting. Gender pay gap analysis. DEI metrics. Health & safety. Training and development. ESRS S1, GRI 401–410, EU Pay Transparency, SEC Item 101, and California Pay Data — one platform.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/dashboard/people" style={{ ...btnPrimary, textDecoration: 'none' }}>Calculate your pay gap →</a>
              <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to a specialist</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['ESRS S1', 'GRI 401–410', 'EU Pay Transparency', 'CA Pay Data', 'SEC Item 101', 'SASB', 'UN SDG 8', 'ISO 45001'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { val: '5%', unit: 'gap trigger', label: 'EU Pay Transparency — gaps above 5% require mandatory joint pay assessment', color: '#ba7517', bg: '#FEF3E2' },
              { val: 'Jun 2026', unit: 'deadline', label: 'EU Pay Transparency member state transposition — 100+ EU employees', color: '#B91C1C', bg: '#FCEBEB' },
              { val: 'ESRS S1', unit: 'active now', label: 'large EU companies reporting on own workforce from FY2024', color: '#7425e3', bg: '#EDE9FE' },
              { val: '100+', unit: 'CA employees', label: 'triggers California Pay Data Reporting Act — annual DFEH submission', color: '#0F6E56', bg: '#E1F5EE' },
            ].map(({ val, unit, label, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${color}22` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 300, lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* NOT AN HR SYSTEM */}
      <section style={{ padding: '2.5rem 2.5rem', background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, fontWeight: 700, color: '#0F6E56' }}>&#8800;</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>ThemisIQ is not an HR system.</div>
              <div style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, maxWidth: 560 }}>Workday, SAP, and SuccessFactors manage your people data. But none of them generate your EU Pay Transparency disclosure, your ESRS S1 workforce report, or your California DFEH submission. ThemisIQ does — in minutes, not months, at a fraction of consulting cost.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, flexShrink: 0 }}>
            {['Works alongside Workday', 'Works alongside SAP', 'Works alongside BambooHR', 'Works alongside any HR system'].map(t => (
              <span key={t} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#fff', border: '0.5px solid #e8e7e4', color: '#555553' }}>{t}</span>
            ))}
          </div>
        </div>
      </section>


      {/* COMPARISON TABLE */}
      <section style={{ padding: '4rem 2.5rem', background: '#fff', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>How we compare</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, color: '#0d0d0d' }}>The gap we fill.</h2>
          </div>
          <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: '#0d0d0d' }}>
              {['', 'Big HR platforms', 'Pay equity specialists', 'ThemisIQ'].map((h, i) => (
                <div key={i} style={{ padding: '14px 16px', fontSize: 11, fontWeight: 700, color: i === 3 ? '#64fe3e' : 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, textAlign: i === 0 ? 'left' : 'center' as const }}>{h}</div>
              ))}
            </div>
            {/* Rows */}
            {[
              { feature: 'EU Pay Transparency disclosure', big: false, specialist: 'partial', themis: true },
              { feature: 'ESRS S1 workforce report', big: false, specialist: false, themis: true },
              { feature: 'California DFEH submission', big: 'partial', specialist: true, themis: true },
              { feature: 'GRI 401–410 export', big: false, specialist: false, themis: true },
              { feature: 'Multi-module compliance platform', big: false, specialist: false, themis: true },
              { feature: 'Works without existing HR system', big: false, specialist: false, themis: true },
              { feature: 'Annual cost', big: '$200k+', specialist: '$30–100k', themis: 'From $799' },
            ].map(({ feature, big, specialist, themis }, i) => {
              const renderVal = (val: boolean | string) => {
                if (val === true) return <span style={{ color: '#0F6E56', fontWeight: 700 }}>✓</span>
                if (val === false) return <span style={{ color: '#B91C1C' }}>✗</span>
                if (val === 'partial') return <span style={{ color: '#ba7517', fontSize: 11 }}>Partial</span>
                return <span style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d' }}>{val}</span>
              }
              return (
                <div key={feature} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: i < 6 ? '0.5px solid #e8e7e4' : 'none', background: i % 2 === 0 ? '#fff' : '#f8f7f5' }}>
                  <div style={{ padding: '12px 16px', fontSize: 13, color: '#0d0d0d', fontWeight: 400 }}>{feature}</div>
                  <div style={{ padding: '12px 16px', fontSize: 13, textAlign: 'center' as const }}>{renderVal(big)}</div>
                  <div style={{ padding: '12px 16px', fontSize: 13, textAlign: 'center' as const }}>{renderVal(specialist)}</div>
                  <div style={{ padding: '12px 16px', fontSize: 13, textAlign: 'center' as const, background: 'rgba(116,37,227,0.04)' }}>{renderVal(themis)}</div>
                </div>
              )
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#888784', fontWeight: 300 }}>
            Big HR platforms = Workday, SAP SuccessFactors · Pay equity specialists = Syndio, Trusaic, Visier
          </div>
        </div>
      </section>

      {/* PAY TRANSPARENCY CALLOUT */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>EU Pay Transparency Directive (2023/970)</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              Do you know your gender pay gap?
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 300, marginBottom: '1.5rem' }}>
              Most companies don't. The EU Pay Transparency Directive requires employers with 100+ EU employees to report their gender pay gap annually (250+ employees) or every 3 years (100–249 employees). A gap exceeding 5% in any job band triggers a mandatory joint pay assessment with worker representatives.
            </p>
            {[
              'Mean and median gender pay gap calculation by job band',
              'Identification of bands exceeding the 5% joint assessment threshold',
              'Pay equity root cause analysis and remediation tracking',
              'Annual disclosure report generation',
              'Joint pay assessment workflow and documentation',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ color: '#64fe3e', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 300, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Workforce framework coverage</div>
            {[
              { fw: 'EU Pay Transparency Dir.', scope: 'Gender pay gap reporting · 100+ EU employees', deadline: 'Jun 2026', urgency: 'critical' },
              { fw: 'ESRS S1', scope: 'Own workforce disclosure · large EU companies', deadline: 'FY2024 active', urgency: 'critical' },
              { fw: 'CA Pay Data Reporting', scope: 'Annual DFEH pay data · 100+ CA employees', deadline: 'Annual · May', urgency: 'high' },
              { fw: 'SEC Item 101', scope: 'Human capital disclosure · US public companies', deadline: 'Annual 10-K', urgency: 'high' },
              { fw: 'GRI 401–410', scope: 'Employment, H&S, training, diversity', deadline: 'Annual', urgency: 'medium' },
              { fw: 'SASB Human Capital', scope: 'Sector-specific workforce metrics', deadline: 'Annual', urgency: 'medium' },
            ].map(({ fw, scope, deadline, urgency }) => {
              const color = urgency === 'critical' ? '#B91C1C' : urgency === 'high' ? '#ba7517' : '#888784'
              return (
                <div key={fw} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 2 }}>{fw}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{scope}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{deadline}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Platform capabilities</div>
          <h2 style={sectionTitle}>Everything your workforce programme needs.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { title: 'Gender pay gap analysis', desc: 'Mean and median pay gap calculation by job band, level, and function. Automated identification of bands exceeding the 5% EU Pay Transparency threshold. Remediation tracking.' },
            { title: 'DEI metrics', desc: 'Workforce composition by gender, ethnicity, age, disability, and seniority. Representation tracking against targets. Board and senior management diversity reporting.' },
            { title: 'Health & safety', desc: 'LTIFR, TRIR, near-miss tracking, and fatality reporting. ISO 45001 alignment. ESRS S1-14 health and safety outcome disclosure preparation.' },
            { title: 'Training & development', desc: 'Training hours per employee, investment per FTE, skills gap tracking, and development programme effectiveness. GRI 404 and ESRS S1-13 disclosure preparation.' },
            { title: 'Labour relations', desc: 'Collective bargaining coverage, works council engagement, freedom of association policy management. ESRS S1-4 documentation and GRI 402–407 reporting.' },
            { title: 'Multi-framework export', desc: 'One workforce data set exports to ESRS S1, GRI 401–410, SEC Item 101, California Pay Data DFEH submission, SASB, and CDP human capital sections.' },
          ].map(({ title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
              
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ESRS S1 */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={eyebrow}>ESRS S1 — Own workforce</div>
            <h2 style={sectionTitle}>Every ESRS S1 disclosure point. Covered.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
            {[
              { ref: 'S1-1', title: 'Policies', desc: 'Workforce policies and commitments documentation' },
              { ref: 'S1-2', title: 'Engagement', desc: 'Worker engagement, consultation, and participation' },
              { ref: 'S1-3', title: 'Processes', desc: 'Processes to remediate negative impacts' },
              { ref: 'S1-4', title: 'Actions', desc: 'Actions and resources for workforce management' },
              { ref: 'S1-5', title: 'Targets', desc: 'Workforce diversity and inclusion targets' },
              { ref: 'S1-6', title: 'Characteristics', desc: 'Headcount, employment type, contract type' },
              { ref: 'S1-7', title: 'Non-employees', desc: 'Contractors and non-employee workers in value chain' },
              { ref: 'S1-8', title: 'Bargaining', desc: 'Collective bargaining coverage and social dialogue' },
              { ref: 'S1-9', title: 'Diversity', desc: 'Gender and age diversity at board and management level' },
              { ref: 'S1-10', title: 'Remuneration', desc: 'Adequate wages and pay ratio disclosure' },
              { ref: 'S1-14', title: 'Health & Safety', desc: 'LTIFR, TRIR, fatalities, and ill health rates' },
              { ref: 'S1-16', title: 'Pay gap', desc: 'Gender pay gap — mean and median by category' },
            ].map(({ ref, title, desc }) => (
              <div key={ref} style={{ background: '#fff', padding: '1.25rem' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#7425e3', letterSpacing: '0.06em', marginBottom: 4 }}>{ref}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 11, color: '#888784', fontWeight: 300, lineHeight: 1.4 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* FRAMEWORK GRID */}
      <section style={{ padding: '5rem 2.5rem', background: '#fff', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>Framework coverage</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 12 }}>Every requirement. One platform.</h2>
            <p style={{ fontSize: 14, color: '#555553', fontWeight: 300, maxWidth: 540, margin: '0 auto', lineHeight: 1.75 }}>One workforce data set generates every report automatically — regulators, investors, customers, and boards all answered from a single source of truth.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              {
                name: 'EU Pay Transparency Directive',
                ref: 'Directive 2023/970',
                deadline: 'June 2026',
                urgency: 'critical',
                who: 'Companies with 100+ EU employees',
                what: 'Annual gender pay gap reporting by job band · 5% threshold triggers joint pay assessment · remediation tracking',
                output: 'EU Pay Transparency annual disclosure report',
              },
              {
                name: 'ESRS S1 — Own Workforce',
                ref: 'ESRS S1 · CSRD',
                deadline: 'FY2024 active',
                urgency: 'critical',
                who: 'Large EU companies (CSRD scope)',
                what: '16 disclosure points · headcount, employment type, H&S, training, diversity, collective bargaining, parental leave',
                output: 'Full ESRS S1 disclosure package',
              },
              {
                name: 'California Pay Data Reporting',
                ref: 'CA SB 973 · DFEH',
                deadline: 'Annual · May',
                urgency: 'high',
                who: 'Companies with 100+ CA employees',
                what: 'Pay data by race/ethnicity, gender, job category · annual DFEH submission · civil penalties for non-compliance',
                output: 'DFEH-ready pay data submission',
              },
              {
                name: 'GRI 401–410',
                ref: 'GRI Standards',
                deadline: 'Annual · voluntary',
                urgency: 'medium',
                who: 'Companies reporting to GRI',
                what: 'Employment · labour relations · H&S · training · diversity · equal remuneration · non-discrimination · freedom of association',
                output: 'GRI 401–410 disclosure tables',
              },
              {
                name: 'SEC Item 101',
                ref: 'Regulation S-K',
                deadline: 'Annual 10-K',
                urgency: 'medium',
                who: 'US public companies',
                what: 'Human capital resources disclosure · material aspects of workforce management · headcount, development, retention',
                output: 'SEC Item 101 narrative disclosure',
              },
              {
                name: 'SASB Human Capital',
                ref: 'SASB Standards',
                deadline: 'Annual · investor-driven',
                urgency: 'medium',
                who: 'Companies reporting to SASB / IFRS S1',
                what: 'Sector-specific workforce metrics · employee engagement · gender and diversity · compensation discussion',
                output: 'SASB human capital metrics table',
              },
            ].map(({ name, ref, deadline, urgency, who, what, output }) => {
              const urgencyColor = urgency === 'critical' ? '#B91C1C' : urgency === 'high' ? '#ba7517' : '#888784'
              const urgencyBg = urgency === 'critical' ? '#FCEBEB' : urgency === 'high' ? '#FEF3E2' : '#f8f7f5'
              return (
                <div key={name} style={{ border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.5rem', background: '#fff', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', lineHeight: 1.3 }}>{name}</div>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: urgencyBg, color: urgencyColor, textTransform: 'uppercase' as const, letterSpacing: '0.06em', flexShrink: 0 }}>{urgency}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{ref}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: urgencyBg, color: urgencyColor, border: `0.5px solid ${urgencyColor}33` }}>{deadline}</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Who</div>
                  <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>{who}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>What ThemisIQ collects</div>
                  <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5, flex: 1 }}>{what}</div>
                  <div style={{ borderTop: '0.5px solid #e8e7e4', paddingTop: 10, marginTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', marginBottom: 2 }}>Output</div>
                    <div style={{ fontSize: 12, color: '#0F6E56', lineHeight: 1.4 }}>✓ {output}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          Do you know your gender pay gap<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>by job band?</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          Most companies don't — and the EU Pay Transparency Directive gives you until June 2026 to find out. ThemisIQ calculates your gap, identifies bands above 5%, and prepares your disclosure.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/dashboard/people" style={{ ...btnPrimary, textDecoration: 'none' }}>Calculate your pay gap →</a>
          <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to a workforce advisor</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '2rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
          <div style={{ fontSize: 12, color: '#888784' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co</div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <a href="/privacy" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Terms of Service</a>
            <a href="/dashboard/people" style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Free Assessment →</a>
          </div>
        </div>
      </footer>

      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const navLink: React.CSSProperties = { fontSize: 11, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const btnOutline: React.CSSProperties = { fontSize: 13, fontWeight: 400, padding: '8px 18px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', textDecoration: 'none', display: 'inline-block' }
const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
