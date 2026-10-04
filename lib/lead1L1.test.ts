import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planGateMessage, saveFailedText, PLAN_GATE_CODES } from './planGateError'
import { saveErrorText } from './scope3/saveError'

// LEAD1 L1 (Oct 2026): the free_tier column and index (M1), the Scope 3 and SBTi plan triggers (M3), and the GHG gate
// rewritten for the free calculation (M2). The database behaviour is proved by docs/review/patches/LEAD1-verify.sql,
// which needs Supabase; these tests hold the app's side (how a refusal reads) and the SQL files' shape.

const ROOT = join(__dirname, '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const P = 'docs/review/patches/'
const M1 = read(P + 'L1-M1-ghg-free-tier.sql')
const M1R = read(P + 'L1-M1-rollback.sql')
const M2 = read(P + 'L1-M2-ghg-entitlement-gate-free-tier.sql')
const M2R = read(P + 'L1-M2-rollback.sql')
const M3 = read(P + 'L1-M3-scope3-sbti-entitlement.sql')
const M3R = read(P + 'L1-M3-rollback.sql')
const VERIFY = read(P + 'LEAD1-verify.sql')
const FI0 = read(P + 'FI0-entitlement-gate-only.sql')
const code = (s: string) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

const FI0_EXPIRED = 'Your GHG access has expired. Renew to save changes to your inventory.'
// The four plan refusals for Scope 3 and SBTi, exactly as ruled on 4 Oct 2026. One set of sentences: the database
// raises them, the SBTi page shows them as raised, and the Scope 3 page's own sentences are these same strings.
const S3_NEVER = 'Scope 3 is part of the GHG plan. Nothing was saved, and your figures are still on screen. Choose a plan to save them.'
const S3_EXPIRED = 'Your GHG access has expired. Nothing was saved, and your figures are still on screen. Renew to save them.'
const SBTI_NEVER = 'Science-based targets are part of the GHG plan. Nothing was saved, and your figures are still on screen. Choose a plan to save them.'
const SBTI_EXPIRED = 'Your GHG access has expired. Nothing was saved, and your figures are still on screen. Renew to save them.'
const FI0_NEVER = 'Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.'

describe('plan-gate refusals in the app', () => {
  it('L1-1: PT402 and PT410 show the database message as written; anything else keeps "Save failed:"', () => {
    expect(PLAN_GATE_CODES).toEqual(['PT402', 'PT410'])
    expect(planGateMessage({ code: 'PT410', message: FI0_EXPIRED })).toBe(FI0_EXPIRED)
    expect(saveFailedText({ code: 'PT402', message: SBTI_NEVER })).toBe(SBTI_NEVER)
    expect(saveFailedText({ code: 'PT410', message: SBTI_EXPIRED })).toBe(SBTI_EXPIRED)
    expect(planGateMessage({ code: '23505', message: 'duplicate key' })).toBeNull()
    expect(saveFailedText({ code: '23505', message: 'duplicate key' })).toBe('Save failed: duplicate key')
    expect(planGateMessage({ code: 'PT402', message: '' })).toBeNull()
  })

  it('L1-2: the Scope 3 page shows the database\'s own sentences for both codes, once, and never the raw message', () => {
    expect(saveErrorText({ code: 'PT402', message: 'raw' })).toBe(S3_NEVER)
    expect(saveErrorText({ code: 'PT410', message: 'raw' })).toBe(S3_EXPIRED)
    // One set of sentences: the shared "Nothing was saved …" clause is not added on top.
    expect(saveErrorText({ code: 'PT402' }).match(/Nothing was saved/g) ?? []).toHaveLength(1)
  })

  it('L1-2b: the four messages in the database are the ruled strings, and no new refusal says "Purchase"', () => {
    const c = code(M3)
    for (const m of [S3_NEVER, S3_EXPIRED, SBTI_NEVER, SBTI_EXPIRED]) expect(c).toContain(`RAISE EXCEPTION '${m}'`)
    expect(c).not.toContain('Purchase')
    // FI0's two GHG messages are unchanged, "Purchase" included, as ruled.
    expect(code(M2)).toContain(FI0_NEVER)
  })

  it('L1-3: every SBTi save and both GHG wizard saves use saveFailedText', () => {
    const sbti = read('app/dashboard/sbti/page.tsx')
    expect(sbti.match(/alert\(saveFailedText\(error\)\)/g) ?? []).toHaveLength(3)
    expect(sbti).not.toContain("alert('Save failed: ' + error.message)")
    const ghg = read('app/dashboard/ghg/page.tsx')
    expect(ghg.match(/alert\(saveFailedText\(error\)\)/g) ?? []).toHaveLength(2)
    expect(ghg).not.toContain("alert('Save failed: ' + error.message)")
  })
})

describe('L1 SQL files (static; the database run is LEAD1-verify.sql)', () => {
  it('L1-4: every file is NOT RUN, one transaction, and states the run order M1, M3, M2, verify', () => {
    for (const s of [M1, M1R, M2, M2R, M3, M3R]) {
      expect(s.split('\n')[2]).toContain('⚠️ NOT RUN.')
      expect(code(s).trim().startsWith('begin;')).toBe(true)
      expect(code(s).trim().endsWith('commit;')).toBe(true)
    }
    expect(VERIFY.split('\n')[2]).toContain('⚠️ NOT RUN.')
    expect(M1).toContain('RUN ORDER (L1): this file (M1), then L1-M3-scope3-sbti-entitlement.sql (M3), then')
    expect(M3).toContain('RUN ORDER (L1): L1-M1-ghg-free-tier.sql (M1), then THIS FILE (M3), then L1-M2-ghg-entitlement-gate-free-tier.sql')
    expect(M2).toContain('RUN ORDER (L1): L1-M1-ghg-free-tier.sql (M1), then L1-M3-scope3-sbti-entitlement.sql (M3), then THIS FILE (M2), then')
  })

  it('L1-5: M1 stops unless no inventory belongs to an account without a GHG entitlement, then adds the column, index and grant', () => {
    const c = code(M1)
    expect(c).toContain("or not exists (select 1 from public.entitlements e where e.user_id = i.user_id and e.module_key = 'ghg')")
    expect(c).toContain('if v_n <> 0 then')
    expect(c).toContain('alter table public.ghg_inventories add column free_tier boolean not null default false;')
    expect(c).toContain('create unique index ghg_inventories_one_free_per_user on public.ghg_inventories (user_id) where free_tier;')
    expect(c).toContain('grant update (free_tier) on public.ghg_inventories to service_role;')
    expect(code(M1R)).toContain('drop column free_tier')
    expect(code(M1R)).toContain('free_tier row(s) exist')
  })

  it('L1-6: M3 stops on any Scope 3 or SBTi row whose owner has no active plan, listing them, then gates all five tables', () => {
    const c = code(M3)
    expect(c).toContain("array['scope3_inventories', 'sbti_company_profile', 'sbti_targets', 'sbti_cycle', 'sbti_scope3_coverage']")
    expect(c).toContain("raise exception 'Pre-flight: % Scope 3 / SBTi row(s) belong to accounts with no active GHG plan: %Nothing was changed.', v_n, v_list;")
    expect(c.match(/create trigger trg_enforce_sbti_entitlement\n  before insert or update on public\.sbti_/g) ?? []).toHaveLength(4)
    expect(c).toContain('create trigger trg_enforce_scope3_entitlement\n  before insert or update on public.scope3_inventories')
    expect(c.match(/USING ERRCODE = 'PT410'/g) ?? []).toHaveLength(2)
    expect(c.match(/USING ERRCODE = 'PT402'/g) ?? []).toHaveLength(2)
    expect(c).toContain('revoke all on function public.enforce_scope3_entitlement() from public, anon, authenticated;')
    expect(c).toContain('revoke all on function public.enforce_sbti_entitlement() from public, anon, authenticated;')
    expect(code(M3R)).toContain('drop function if exists public.enforce_scope3_entitlement();')
  })

  it('L1-7: M2 keeps the FI0 messages word for word, adds the free branch, and needs M1 and M3 first', () => {
    const c = code(M2)
    expect(c).toContain(`RAISE EXCEPTION '${FI0_EXPIRED}'\n        USING ERRCODE = 'PT410';`)
    expect(c).toContain(`RAISE EXCEPTION '${FI0_NEVER}'\n        USING ERRCODE = 'PT402';`)
    expect(FI0).toContain(FI0_EXPIRED)
    expect(FI0).toContain(FI0_NEVER)
    expect(c).toContain('old_free := OLD.free_tier;')
    expect(c).toContain('IF NOT old_free OR NOT NEW.free_tier THEN')
    expect(c).toContain("jsonb_path_exists(coalesce(NEW.locations_data, '[]'::jsonb), '$[*].source_docs[*]')")
    expect(c).toContain('Run L1-M1-ghg-free-tier.sql first.')
    expect(c).toContain('Run L1-M3-scope3-sbti-entitlement.sql first.')
    expect(c).not.toContain('location_allowance > ')
  })

  it('L1-8: the M2 rollback restores the FI0 body exactly', () => {
    const body = (s: string) => s.slice(s.indexOf('create or replace function public.enforce_ghg_location_allowance()'),
      s.indexOf('$$ language plpgsql security definer set search_path = public, pg_catalog;'))
    expect(body(M2R)).toBe(body(FI0))
    expect(body(M2R).length).toBeGreaterThan(500)
  })

  it('L1-9: the verify script covers every rule in the design', () => {
    for (const c of [
      "('V1 active: paid inventory inserted', 'accepted'", "('V4 expired: paid inventory updated', 'refused PT410'",
      "('V5 expired: upsert onto the paid inventory refused', 'refused PT410'", "('V7 expired: free calculation inserted', 'accepted'",
      "('V8 expired: second free calculation', 'refused 23505 one-free'", "('V9 expired: source document on the free calculation', 'refused PT402'",
      "('V11 expired: free turned into paid', 'refused PT410'", "('V12 expired: paid turned into free', 'refused PT410'",
      "('V13 expired: Scope 3 updated', 'refused PT410'", "('V14 expired: SBTi updated', 'refused PT410'",
      "('V16 never bought: Scope 3 updated', 'refused PT402'", "('V17 never bought: SBTi updated', 'refused PT402'",
      "('V19 granted: service_role converts the free calculation', '1 row'", "('V20 granted: paid inventory, Scope 3 and SBTi updated', 'accepted'",
    ]) {
      expect(VERIFY).toContain(c)
    }
    expect(VERIFY).toContain("execute 'set local role authenticated';")
    expect(VERIFY).toContain("execute 'set local role service_role';")
    expect(VERIFY).toContain("raise exception 'lead1_undo';")
  })
})
