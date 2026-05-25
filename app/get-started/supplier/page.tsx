import PackFlow from '../_pack/PackFlow'

export const metadata = {
  title: 'Supplier Readiness Pack — ThemisIQ',
  description: 'A customer is asking you to report. Build your GHG inventory, map your supply chain, send supplier questionnaires, and export a customer-ready report.',
}

export default function Page() {
  return <PackFlow slug="supplier" />
}
