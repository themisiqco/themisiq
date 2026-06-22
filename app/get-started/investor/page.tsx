import PackFlow from '../_pack/PackFlow'
import { redirect } from 'next/navigation'
import { NEW_PRICING_ACTIVE } from '../../../lib/pricing'
import { PACK_SLUG_MODULES } from '../../../lib/packEntryPoints'

export const metadata = {
  title: 'Investor ESG Pack — ThemisIQ',
  description: 'An investor requires it. Build your GHG inventory, assess climate risk, map your supply chain, profile your deals, and export an investor-ready report.',
}

export default function Page() {
  if (NEW_PRICING_ACTIVE) redirect(`/pricing?modules=${PACK_SLUG_MODULES.investor}`)
  return <PackFlow slug="investor" />
}
