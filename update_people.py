with open('/Users/maj/themisiq/app/people/page.tsx', 'r') as f:
    content = f.read()

# Update the differentiator text
old_text = "Workday, SAP, and BambooHR manage your people. ThemisIQ turns your existing HR data into the compliance reports your regulators, investors, and customers require — without a six-figure consulting engagement."
new_text = "Workday, SAP, and SuccessFactors manage your people data. But none of them generate your EU Pay Transparency disclosure, your ESRS S1 workforce report, or your California DFEH submission. ThemisIQ does — in minutes, not months, at a fraction of consulting cost."

content = content.replace(old_text, new_text)

# Add comparison table after the differentiator section
comparison_table = """
      {/* COMPARISON TABLE */}
      <section style={{ padding: '4rem 2.5rem', background: '#fff', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>How we compare</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, color: '#0d0d0d' }}>The gap nobody else fills.</h2>
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

"""

content = content.replace('      {/* PAY TRANSPARENCY CALLOUT */}', comparison_table + '      {/* PAY TRANSPARENCY CALLOUT */}')

with open('/Users/maj/themisiq/app/people/page.tsx', 'w') as f:
    f.write(content)

print("Done")
