import PackFlow from '../_pack/PackFlow'
import { redirect } from 'next/navigation'
import { NEW_PRICING_ACTIVE } from '../../../lib/pricing'
import { PACK_SLUG_MODULES } from '../../../lib/packEntryPoints'

export const metadata = {
  title: 'Supplier Readiness Pack — ThemisIQ',
  description: 'A customer is asking you to report. Build your GHG inventory, map your supply chain, send supplier questionnaires, and export a customer-ready report.',
}

export default function Page() {
  if (NEW_PRICING_ACTIVE) redirect(`/pricing?modules=${PACK_SLUG_MODULES.supplier}`)
  return <PackFlow slug="supplier" />
}
