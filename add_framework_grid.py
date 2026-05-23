with open('/Users/maj/themisiq/app/people/page.tsx', 'r') as f:
    content = f.read()

framework_grid = """
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

"""

content = content.replace('      {/* CTA */}', framework_grid + '      {/* CTA */}')

with open('/Users/maj/themisiq/app/people/page.tsx', 'w') as f:
    f.write(content)

print("Done")
