// lib/forcedLabour/pendingReforms.ts
// Announced or proposed changes to the UK and Australian reporting laws, recorded SEPARATELY from the
// requirements, dated, with the status that official sources showed on the day they were read.
//
// ⚠️ NOTHING HERE IS LAW. The requirements in force are lib/forcedLabour/uk/requirements.ts and
// lib/forcedLabour/au/requirements.ts. Nothing in this file may be shown to a customer as a requirement,
// and `asOf` is the date the status below was true: past it, read the sources again before relying on it.
//
// `wouldChange` names the cells of lib/forcedLabour/requirementsMap.ts each reform would alter, by
// country and topic, so that when one becomes law the map shows what to re-read.
//
// `quoted` holds the source's words, checked word for word against the downloaded text on the date read.
// `unknown` lists what could not be established from an official source, and why. It is not filled from
// memory or from secondary sources.

import type { MapTopic } from './requirementsMap'

export type PendingReform = {
  key: string
  country: 'uk' | 'au'
  title: string
  asOf: string
  status: string
  sources: readonly string[]
  quoted: readonly string[]
  wouldChange: readonly { topic: MapTopic; how: string }[]
  unknown: readonly string[]
}

export const PENDING_REFORMS: readonly PendingReform[] = [
  {
    key: 'uk-immigration-asylum-bill-2026',
    country: 'uk',
    title: 'Immigration and Asylum Bill (Bill 105, 2026-27), measure 16: transparency in supply chains',
    asOf: '2026-10-01',
    status:
      'A bill before the House of Commons, not law. First reading 30 Jun 2026, second reading 13 Jul 2026. Commons committee stage began 15 Sep 2026, with sittings listed to 3 Nov 2026. GOV.UK still tells organizations to report under the current requirements.',
    sources: ['UK_IMMIGRATION_ASYLUM_BILL_URL', 'UK_IMMIGRATION_ASYLUM_BILL_IA_URL', 'UK_IMMIGRATION_ASYLUM_BILL_RPC_URL'],
    quoted: [
      'bring public bodies with a budget of £36 million and over in scope',
      'mandate reporting on certain topics',
      'mandate publication of statements to a central online repository, currently the Modern Slavery Statement Registry',
      'bring greater clarity on approval for statements',
      'make express provision for group statements',
      'introduce a reporting deadline',
      'introduce civil penalties for non-compliance',
      'Topics are: 1. Organisation structure, operations and supply chains; 2. Policies in relation to slavery and trafficking; 3. Assessing and mitigating risks; 4. Due diligence; 5. Training; and 6. Monitoring effectiveness.',
    ],
    wouldChange: [
      { topic: 'who', how: 'Adds public bodies with a budget of £36 million and over.' },
      { topic: 'content', how: 'The six topics become mandatory instead of "may include"; where no steps were taken, a reason would be required.' },
      { topic: 'approval', how: '"Greater clarity on approval"; the change itself is not known.' },
      { topic: 'joint', how: 'Group statements would be in the Act, not only in the guidance.' },
      { topic: 'timing', how: 'A statutory deadline would replace the guidance’s six-month recommendation.' },
      { topic: 'publication', how: 'Publication to the registry would be mandatory instead of encouraged.' },
      { topic: 'penalties', how: 'Civil penalties would be added to the injunction route.' },
    ],
    unknown: [
      'The bill’s text. publications.parliament.uk (bill text and explanatory notes) and bills.parliament.uk return a Cloudflare challenge or 403 to an automated client, so the clauses were not read. Every item above is from the Home Office impact assessment, which describes intent, not the bill.',
      'The length of the deadline, the amount or basis of any civil penalty, what changes on approval, and when any of it would commence.',
      'The impact assessment describes the current threshold as "a turnover of more than £36 million"; the regulation in force says not less than £36 million (UK_REGS_2). The regulation is the authority.',
      'The Regulatory Policy Committee rated the impact assessment "Not fit for purpose" (opinion issued 11 Aug 2026), on its options assessment; that is a view of the assessment, not of the measures.',
    ],
  },
  {
    key: 'au-announcement-2026-07-17',
    country: 'au',
    title: 'Australian Government announcement of 17 July 2026',
    asOf: '2026-10-01',
    status:
      'UNVERIFIED. No official source could be reached. The Federal Register of Legislation lists no amending Act to the Modern Slavery Act 2018 after Act No. 42, 2024, and its latest compilation (No. 2) shows no unincorporated amendments, so nothing announced has become law.',
    sources: ['MODERN_SLAVERY_AU_URL'],
    quoted: [],
    wouldChange: [],
    unknown: [
      'What was announced. ministers.ag.gov.au and ag.gov.au timed out on every attempt on 1 Oct 2026 (over HTTP/2 and HTTP/1.1), and aph.gov.au returned 403, so neither the announcement nor any bill could be read. The cells it would change are not recorded, because they could only be guessed.',
    ],
  },
]
