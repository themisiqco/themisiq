import PackFlow from '../_pack/PackFlow'

export const metadata = {
  title: 'Climate Readiness Pack — ThemisIQ',
  description: 'A bank or insurer is asking. Build your GHG inventory, assess climate risk, and export a CDP-aligned, IFRS S2 disclosure.',
}

export default function Page() {
  return <PackFlow slug="climate" />
}
