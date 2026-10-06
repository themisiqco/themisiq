import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FREE_ACCOUNT_ROWS } from './legal/freeAccountCopy'
import { PURCHASE_CONSENT_VERSION } from './purchaseConsentVersion'

// RET1 (Oct 2026): rate-limit records deleted after 30 days, expired free-calculation holds swept daily, by pg_cron
// (docs/review/patches/RET1-M10-retention-jobs.sql), and the Privacy Policy (v2.4) saying exactly that.
const ROOT = join(__dirname, '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const M10 = 'docs/review/patches/RET1-M10-retention-jobs.sql'
const VERIFY = 'docs/review/patches/RET1-M10-verify.sql'
const row = (label: string) => FREE_ACCOUNT_ROWS.find(r => r[0] === label)!

describe('M10', () => {
  it('RT1: NOT RUN headers; pg_cron enabled if absent; must run before the Privacy change', () => {
    const m10 = read(M10)
    expect(m10.split('\n')[2]).toContain('⚠️ NOT RUN.')
    expect(read(VERIFY).split('\n')[2]).toContain('⚠️ NOT RUN.')
    expect(m10).toContain('create extension if not exists pg_cron with schema pg_catalog;')
    expect(m10).toContain('THIS FILE MUST RUN BEFORE THAT PAGE GOES LIVE')
  })

  it('RT2: rate-limit rows older than 30 days, by created_at; expired holds by expires_at; one table each, in batches', () => {
    const m10 = read(M10)
    const fn = (name: string) => m10.slice(m10.indexOf(`create or replace function public.${name}()`), m10.indexOf('$fn$;', m10.indexOf(`create or replace function public.${name}()`)))
    const rl = fn('ret1_purge_rate_limits')
    const hold = fn('ret1_purge_free_calc_holds')
    expect(rl).toContain("where created_at < now() - interval '30 days'")
    expect(hold).toContain('where expires_at < now()')
    for (const [f, table] of [[rl, 'public.rate_limits'], [hold, 'public.free_calc_pending']] as const) {
      expect(f).toContain('limit 5000')
      expect(f).toContain('exit when v_n < 5000;')
      // One table only: every table it names is its own.
      expect((f.match(/public\.\w+/g) ?? []).filter(t => t !== table && !t.startsWith('public.ret1_'))).toEqual([])
      expect(f).toContain("set search_path = ''")
      expect(f).toContain('security definer')
    }
  })

  it('RT3: two named daily jobs, replaced rather than added when the file runs again', () => {
    const m10 = read(M10)
    expect(m10).toContain("perform cron.unschedule(jobid) from cron.job where jobname in ('ret1-purge-rate-limits', 'ret1-purge-free-calc-holds');")
    expect(m10).toContain("perform cron.schedule('ret1-purge-rate-limits', '15 7 * * *', 'select public.ret1_purge_rate_limits()');")
    expect(m10).toContain("perform cron.schedule('ret1-purge-free-calc-holds', '25 7 * * *', 'select public.ret1_purge_free_calc_holds()');")
    expect(m10).toContain('07:15 UTC = 03:15 Eastern')
    expect(m10).toContain('07:25 UTC = 03:25 Eastern')
    // The post-flight insists on exactly one of each.
    expect(m10.match(/\) <> 1 then/g) ?? []).toHaveLength(2)
  })

  it('RT4: the verify proves the jobs, the 30-day edge, the hold edge, and cleans up', () => {
    const v = read(VERIFY)
    for (const id of ['J1', 'J2', 'J3', 'R1', 'R2', 'H1', 'H2']) expect(v).toContain(`'${id} `)
    expect(v).toContain("now() - interval '31 days'")
    expect(v).toContain("now() - interval '29 days'")
    expect(v).toContain("('R1 rate_limits row 31 days old', 'deleted', r[1])")
    expect(v).toContain("('R2 rate_limits row 29 days old', 'kept', r[2])")
    expect(v).toContain("('H1 hold whose 24 hours ended yesterday', 'deleted', r[3])")
    expect(v).toContain("('H2 hold still within its 24 hours', 'kept', r[4])")
    expect(v).toContain("raise exception 'm10_undo';")
    expect(v).toContain("'nothing left behind', '0'")
  })
})

describe('the Privacy Policy states the same periods', () => {
  it('RT5: the retention table row, the free-account rows, and v2.4', () => {
    const p = read('app/privacy/page.tsx')
    expect(p).toContain("['Rate-limit records (IP address and email key)', '30 days, then deleted automatically', 'Protecting the service from abuse'],")
    expect(p).toContain("['Calculation held while you confirm your email', 'Deleted when you confirm, or deleted within a day after its 24 hours end', 'Providing the service you asked for'],")
    expect(p).toContain("{['Effective: October 6, 2026', 'TIQ-PRV-001 · v2.4',")
    expect(row('Your IP address')[2]).toBe('With the held copy, until that copy is deleted. In our rate-limit records, for 30 days.')
    expect(row('Your calculation: the sites and figures you entered, and the results worked out from them')[2])
      .toBe('The held copy: deleted when you confirm, or deleted within a day after its 24 hours end. The saved calculation: while the account exists.')
    expect(p + FREE_ACCOUNT_ROWS.flat().join(' ')).not.toContain('as security records')
    expect(p + FREE_ACCOUNT_ROWS.flat().join(' ')).not.toContain('no longer usable after 24 hours')
  })

  it('RT6: page and SQL agree: 30 days for rate-limit records, daily for holds', () => {
    const m10 = read(M10)
    expect(m10).toContain("interval '30 days'")
    expect(read('app/privacy/page.tsx')).toContain("'30 days, then deleted automatically'")
    // Daily: both jobs run once a day ('M H * * *'), which "within a day" depends on.
    expect(m10).toMatch(/'ret1-purge-free-calc-holds', '\d+ \d+ \* \* \*'/)
    expect(m10).toMatch(/'ret1-purge-rate-limits', '\d+ \d+ \* \* \*'/)
  })

  it('RT7: recorded as v2.4; the consent version does not move; no em dash in any changed copy', () => {
    const readme = read('docs/policy-snapshots/README.md')
    expect(readme).toContain('`2026-10-privacy-v2.4.md` | Privacy Policy v2.4 (current)')
    const rec = read('docs/policy-snapshots/2026-10-privacy-v2.4.md')
    expect(rec).toContain('This version must not go live before M10 has run')
    expect(PURCHASE_CONSENT_VERSION).toBe('2026-10-v3')
    for (const s of [row('Your IP address')[2], row('Your calculation: the sites and figures you entered, and the results worked out from them')[2],
      '30 days, then deleted automatically', 'Protecting the service from abuse', 'Deleted when you confirm, or deleted within a day after its 24 hours end']) {
      expect(s).not.toContain('—')
    }
    expect(rec).not.toContain('—')
  })
})
