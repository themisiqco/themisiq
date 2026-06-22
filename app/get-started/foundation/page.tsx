import PackFlow from '../_pack/PackFlow'
import { redirect } from 'next/navigation'
import { NEW_PRICING_ACTIVE } from '../../../lib/pricing'
import { PACK_SLUG_MODULES } from '../../../lib/packEntryPoints'

export const metadata = {
  title: 'ESG Foundation Pack — ThemisIQ',
  description: 'Your board wants ESG in place. Build your GHG inventory, complete your workforce profile, assess climate risk, and export a board-ready ESG report.',
}

export default function Page() {
  if (NEW_PRICING_ACTIVE) redirect(`/pricing?modules=${PACK_SLUG_MODULES.foundation}`)
  return <PackFlow slug="foundation" />
}
