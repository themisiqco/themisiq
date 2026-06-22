import PackFlow from '../_pack/PackFlow'
import { redirect } from 'next/navigation'
import { NEW_PRICING_ACTIVE } from '../../../lib/pricing'
import { PACK_SLUG_MODULES } from '../../../lib/packEntryPoints'

export const metadata = {
  title: 'Climate Readiness Pack — ThemisIQ',
  description: 'A bank or insurer is asking. Build your GHG inventory, assess climate risk, and export a CDP-aligned, IFRS S2 disclosure.',
}

export default function Page() {
  if (NEW_PRICING_ACTIVE) redirect(`/pricing?modules=${PACK_SLUG_MODULES.climate}`)
  return <PackFlow slug="climate" />
}
