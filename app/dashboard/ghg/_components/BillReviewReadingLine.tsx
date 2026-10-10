// app/dashboard/ghg/_components/BillReviewReadingLine.tsx
//
// BR6: how this inventory's bills are read, shown read-only on the Energy & fuel data step to a Bill Review holder.
// Q1 (ruled 10 Oct 2026): the customer cannot change it here; they ask, and ThemisIQ changes it. All text is shown to
// the customer: plain language, no em dash.

import type { BillReviewReading } from '../../../../lib/pricing'
import { readingLine, sinceLine, specialistMailto, ASK_SPECIALIST_LEAD, ASK_SPECIALIST, ASK_SPECIALIST_AFTER } from '../../../../lib/billReview/readingWords'

export function BillReviewReadingLine({ reading, since, companyName, yearText }: {
  reading: BillReviewReading; since: string | null; companyName: string; yearText: string
}) {
  const changed = sinceLine(reading, since)
  return (
    <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '10px 14px', marginBottom: '1.25rem', fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
      <div>
        {readingLine(reading)}
        {reading === 'ai' && (
          <> {ASK_SPECIALIST_LEAD} <a href={specialistMailto(companyName, yearText)} style={{ color: 'var(--color-brand)', textDecoration: 'underline' }}>{ASK_SPECIALIST}</a>. {ASK_SPECIALIST_AFTER}</>
        )}
      </div>
      {changed && <div style={{ marginTop: 4 }}>{changed}</div>}
    </div>
  )
}
