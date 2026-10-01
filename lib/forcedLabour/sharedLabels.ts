// lib/forcedLabour/sharedLabels.ts
// The label a shared answer is shown under on the report overview, a shared screen (Canadian spelling): the
// Canada builder's label where Canada asks it, otherwise the label of the first other builder that does.
import { FIELD_REGISTRY } from './fieldRegistry'
import { SECTIONS } from '../s211/builderContent'
import { UK_SECTIONS } from './uk/builderContent'

const ORGANIZATION_LABEL: Record<string, string> = {
  'organization.revenue_amount': 'Organization revenue, most recent financial year',
  'organization.revenue_currency': 'Currency of that revenue',
}

export function sharedFieldLabel(fieldKey: string): string {
  if (ORGANIZATION_LABEL[fieldKey]) return ORGANIZATION_LABEL[fieldKey]
  const reg = FIELD_REGISTRY.find(f => f.key === fieldKey)
  if (reg?.canada?.kind === 'section') {
    const home = reg.canada
    const f = SECTIONS.find(s => s.key === home.section)?.fields.find(x => x.key === home.field)
    if (f) return f.label
  }
  for (const s of UK_SECTIONS) { const f = s.fields.find(x => x.registryKey === fieldKey); if (f) return f.label }
  return fieldKey
}
