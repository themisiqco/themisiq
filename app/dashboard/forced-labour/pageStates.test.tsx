// app/dashboard/forced-labour/pageStates.test.tsx
// Each builder page rendered in each access state. The access read (useS211Access) is replaced so the
// state is set, not fetched; data a page loads in an effect is not loaded (effects do not run in a
// server render), which is enough to see what each state offers before any data arrives.
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BuilderState } from '../../../lib/s211/builderAccess'
import { ORDER_HREF, ORDER_LABEL, SIGNED_OUT_MESSAGE, PREVIEW_MESSAGE, READ_ONLY_MESSAGE, PREVIEW_SECTION_MESSAGE, UNKNOWN_MESSAGE } from '../../../lib/s211/builderAccess'
import { SECTIONS } from '../../../lib/s211/builderContent'

const h = vi.hoisted(() => ({ state: 'full' as BuilderState }))
vi.mock('./_components/useS211Access', () => ({ useS211Access: () => h.state }))
vi.mock('../../components/Nav', () => ({ default: () => null }))
// The browser client needs the public Supabase URL at import. No call reaches it: effects do not run here.
vi.mock('../../../lib/supabase', () => ({ supabase: {} }))

const { default: ListPage } = await import('./page')
const { default: HomePage } = await import('./[id]/page')
const { default: CheckPage } = await import('./[id]/check/page')
const { default: SectionRoute } = await import('./[id]/[section]/page')
const { default: PreviewRoute } = await import('./preview/[section]/page')

// A params promise React's use() can read synchronously.
const params = <T,>(v: T) => Object.assign(Promise.resolve(v), { status: 'fulfilled', value: v }) as unknown as Promise<T>
const render = (state: BuilderState, el: React.ReactElement) => { h.state = state; return renderToStaticMarkup(el) }
const decode = (html: string) => html.replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"')

const pages = () => ({
  list: <ListPage />,
  home: <HomePage params={params({ id: 'r1' })} />,
  check: <CheckPage params={params({ id: 'r1' })} />,
  section: <SectionRoute params={params({ id: 'r1', section: 'risks' })} />,
})

describe('signed out: every builder page asks the visitor to sign in, and shows nothing else', () => {
  it.each(Object.entries(pages()))('%s', (_, el) => {
    const html = decode(render('signed-out', el))
    expect(html).toContain(SIGNED_OUT_MESSAGE)
    expect(html).toMatch(/href="\/login\?next=/)
    expect(html).not.toContain('Start the report')
  })
  it('the preview walkthrough too', () => {
    expect(decode(render('signed-out', <PreviewRoute params={params({ section: 'risks' })} />))).toContain(SIGNED_OUT_MESSAGE)
  })
})

describe('never bought (preview)', () => {
  it('the list explains the module and offers the order link and the read-through; no report can be started', () => {
    const html = decode(render('preview', pages().list))
    expect(html).toContain('Forced Labour Reporting')
    expect(html).toContain(`href="${ORDER_HREF}"`)
    expect(html).toContain(ORDER_LABEL)
    expect(ORDER_LABEL).toBe('Order the module, $1,499/yr')
    expect(html).toContain('href="/dashboard/forced-labour/preview/report_details"')
    for (const d of SECTIONS) expect(html).toContain(d.title.replace(/'/g, '\''))
    expect(html).not.toContain('Start the report')
    expect(html).not.toContain('Your reports')
  })

  it.each(['home', 'check', 'section'] as const)('a report\'s %s page shows the preview notice, not a report', key => {
    const html = decode(render('preview', pages()[key]))
    expect(html).toContain(PREVIEW_MESSAGE)
    expect(html).toContain(ORDER_LABEL)
    expect(html).not.toContain('Mark as complete')
  })

  it('the walkthrough shows the whole section, read-only: the Act, plain terms, readers, key terms, guidance, and disabled fields', () => {
    const html = decode(render('preview', <PreviewRoute params={params({ section: 'risks' })} />))
    const risks = SECTIONS.find(d => d.key === 'risks')!
    expect(html).toContain(PREVIEW_SECTION_MESSAGE)
    expect(html).toContain('What the Act asks')
    expect(html).toContain('In plain terms')
    expect(html).toContain('What readers look for')
    expect(html).toContain('Key terms')
    expect(html).toContain('What Public Safety Canada')
    expect(html).toContain(risks.fields.find(f => f.key === 'management_steps')!.label)
    expect(html).toMatch(/<fieldset disabled=""/)
    expect(html).not.toContain('Mark as complete')
    expect(html).not.toContain('Back to report overview')
    expect(html).toContain('href="/dashboard/forced-labour/preview/remediation"')   // Next
  })
})

describe('expired (read-only)', () => {
  it('the list says so plainly, keeps the reports, and offers no new report', () => {
    const html = decode(render('read-only', pages().list))
    expect(html).toContain(READ_ONLY_MESSAGE)
    expect(html).toContain('Your reports')
    expect(html).not.toContain('Start the report')
    expect(html).toContain(`href="${ORDER_HREF}"`)
  })
})

describe('full access', () => {
  it('the list offers a new report, with no banner', () => {
    const html = decode(render('full', pages().list))
    expect(html).toContain('Start the report')
    expect(html).not.toContain(READ_ONLY_MESSAGE)
    expect(html).not.toContain(ORDER_LABEL)
  })
})

describe('access that could not be checked', () => {
  it.each(Object.entries(pages()))('%s says so, and shows no paywall', (_, el) => {
    const html = decode(render('unknown', el))
    expect(html).toContain(UNKNOWN_MESSAGE)
    expect(html).not.toContain(ORDER_LABEL)
  })
})

describe('read-only: the parts that appear once a report has loaded (checked in the source)', () => {
  // These render after the page's own data load, which a server render does not run.
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const section = read('app/dashboard/forced-labour/_components/SectionPage.tsx')
  const home = read('app/dashboard/forced-labour/[id]/page.tsx')
  const check = read('app/dashboard/forced-labour/[id]/check/page.tsx')

  it('a section: nothing is scheduled to save, every field is disabled, and complete/reopen and the autosave line are gone', () => {
    expect(section).toMatch(/const writable = canWrite\(useBuilderState\(\)\) && !preview/)
    expect(section).toMatch(/const apply = \(c: SectionContent\) => \{\n\s+if \(!writable\) return/)
    expect(section).toContain('<fieldset disabled={!writable}')
    expect(section).toMatch(/\{writable && \(status === 'complete'/)
    expect(section).toContain('{!preview && !writable && <ReadOnlyBanner />}')
    // No draft is built into a section that cannot be saved, and no replace-draft panel is offered.
    expect(section).toContain("if (writable && sectionKey === 'steps_taken'")
    expect(section).toContain('{pending && writable && (')
  })

  it('the report home: the applicability answers are shown disabled, with no save button', () => {
    expect(home).toContain('<fieldset disabled={!writable}')
    expect(home).toContain('{writable && <div style={{ display: \'flex\', gap: 12, alignItems: \'center\', marginTop: 10 }}>')
    expect(home).toContain('{!writable && <ReadOnlyBanner extra={READ_ONLY_EXPORT_NOTE} />}')
  })

  it('the check page: the banner, and the download stays for a report that passes the export gate', () => {
    expect(check).toContain('{!writable && <ReadOnlyBanner />}')
    expect(check).toContain('Download PDF')
    expect(check).not.toMatch(/writable && .*Download PDF/)
  })
})
