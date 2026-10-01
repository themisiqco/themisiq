import { describe, it, expect } from 'vitest'
import { match, compile } from 'next/dist/compiled/path-to-regexp'
import nextConfig from '../../next.config'
import { SECTION_KEYS } from '../s211/builderContent'

// Stage D1: a report's Canada sections and check page moved under /canada, so /dashboard/forced-labour/[id]
// could become the overview. The old URLs redirect permanently; nothing else does.

async function destination(url: string): Promise<string | null> {
  for (const r of await nextConfig.redirects!()) {
    const m = match(r.source)(url)
    if (m) return compile(r.destination)(m.params as Record<string, string>)
  }
  return null
}

describe('the old Canada URLs redirect to the Canada tab', () => {
  it('every one of the eleven sections, and the check page, permanently', async () => {
    for (const k of SECTION_KEYS) expect(await destination(`/dashboard/forced-labour/r1/${k}`), k).toBe(`/dashboard/forced-labour/r1/canada/${k}`)
    expect(await destination('/dashboard/forced-labour/r1/check')).toBe('/dashboard/forced-labour/r1/canada/check')
    const rules = (await nextConfig.redirects!()).filter(r => r.source.startsWith('/dashboard/forced-labour/') && r.destination.includes('/canada/'))
    expect(rules.length).toBe(2)
    expect(rules.every(r => r.permanent === true)).toBe(true)
  })

  it('the redirect lists exactly the Canada section keys', async () => {
    const rule = (await nextConfig.redirects!()).find(r => r.destination === '/dashboard/forced-labour/:id/canada/:section')!
    const keys = /:section\(([^)]*)\)/.exec(rule.source)![1].split('|')
    expect(keys).toEqual([...SECTION_KEYS])
  })

  it('the overview, the tabs, the new Canada URLs and the preview walkthrough are left alone', async () => {
    for (const url of ['/dashboard/forced-labour/r1', '/dashboard/forced-labour/r1/canada', '/dashboard/forced-labour/r1/canada/training',
      '/dashboard/forced-labour/r1/canada/check', '/dashboard/forced-labour/r1/uk', '/dashboard/forced-labour/r1/uk/training',
      '/dashboard/forced-labour/preview/training', '/dashboard/forced-labour/preview/report_details', '/dashboard/forced-labour']) {
      expect(await destination(url), url).toBeNull()
    }
  })

  it('the old /dashboard/s211 URLs still reach the right page, in two permanent steps', async () => {
    const first = await destination('/dashboard/s211/r1/training')
    expect(first).toBe('/dashboard/forced-labour/r1/training')
    expect(await destination(first!)).toBe('/dashboard/forced-labour/r1/canada/training')
  })
})
