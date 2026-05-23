with open('/Users/maj/themisiq/app/people/page.tsx', 'r') as f:
    content = f.read()

differentiator = """
      {/* NOT AN HR SYSTEM */}
      <section style={{ padding: '2.5rem 2.5rem', background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, fontWeight: 700, color: '#0F6E56' }}>&#8800;</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>ThemisIQ is not an HR system.</div>
              <div style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, maxWidth: 560 }}>Workday, SAP, and BambooHR manage your people. ThemisIQ turns your existing HR data into the compliance reports your regulators, investors, and customers require — without a six-figure consulting engagement.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, flexShrink: 0 }}>
            {['Works alongside Workday', 'Works alongside SAP', 'Works alongside BambooHR', 'Works alongside any HR system'].map(t => (
              <span key={t} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#fff', border: '0.5px solid #e8e7e4', color: '#555553' }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

"""

content = content.replace('      {/* PAY TRANSPARENCY CALLOUT */}', differentiator + '      {/* PAY TRANSPARENCY CALLOUT */}')

with open('/Users/maj/themisiq/app/people/page.tsx', 'w') as f:
    f.write(content)

print("Done")
