// POST /api/ghg/free-calc/claim — saves the free calculation to the signed-in account (LEAD1 L3, Oct 2026; design
// 1.4 to 1.6 and 3). The logic is lib/ghg/freeCalcService.ts claimFreeCalc; this file wires it to Supabase:
//   AS THE USER (lib/supabaseAuthed.ts, RLS and the GHG save trigger apply): the plan, their inventories, their
//   company, the insert, and the replacement of their own free row;
//   AS THE SERVICE ROLE: free_calc_pending (service-role only) and profiles (the claim fills in name, company,
//   signup_source and country; grants in docs/review/patches/L3-M6-profiles-on-signup.sql).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../../lib/supabaseAuthed'
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { accessFromRow } from '../../../../../lib/entitlementAccess'
import { claimFreeCalc, type PendingRow } from '../../../../../lib/ghg/freeCalcService'
import type { OwnInventory } from '../../../../../lib/ghg/freeCalc'
import { RESULTS_EMAIL_COLUMNS, type SavedInventoryRow } from '../../../../../lib/ghg/resultsEmail'
import { sendResultsEmail } from '../../../../../lib/ghg/resultsEmailSend'
import { SITE_ORIGIN } from '../../../../../lib/siteOrigin'
import { ipFromHeaders } from '../../../../../lib/rateLimit'
import { activeConsent, type ConsentRow } from '../../../../../lib/consent/marketing'


const PENDING_COLUMNS = 'id, email, email_key, full_name, company, payload, created_at, expires_at'

export async function POST(req: NextRequest) {
  let authed
  try {
    authed = await getAuthedClient(bearerFrom(req))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ ok: false, code: 'unauthenticated', message: 'Sign in to keep your calculation.' }, { status: 401 })
    console.error('[free-calc/claim] auth failed:', err)
    return NextResponse.json({ ok: false, code: 'auth_failed' }, { status: 500 })
  }
  // A session from a verified sign-in always carries the address it was verified with.
  if (!authed.email) return NextResponse.json({ ok: false, code: 'no_email', message: 'This account has no email address to match a calculation to.' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { body = {} }

  const db = authed.supabase
  const admin = getSupabaseAdmin()
  const userId = authed.userId

  const result = await claimFreeCalc(body, {
    user: { id: userId, email: authed.email },
    now: new Date(),
    getAccess: async () => {
      const { data, error } = await db.from('entitlements').select('module_key, term_end').eq('module_key', 'ghg').maybeSingle()
      return accessFromRow(error ? { ok: false } : { ok: true, row: data }, new Date())
    },
    listOwnInventories: async () => {
      const { data } = await db.from('ghg_inventories').select('id, company_name, reporting_year, free_tier')
      return (data ?? []) as OwnInventory[]
    },
    resolveCompany: async (name) => {
      const { data: existing } = await db.from('companies').select('id').eq('user_id', userId).eq('name', name).maybeSingle()
      if (existing) return { id: existing.id as string }
      const { data, error } = await db.from('companies').insert({ user_id: userId, name }).select('id').single()
      return error || !data ? { error: error ?? { message: 'no company row returned' } } : { id: data.id as string }
    },
    insertInventory: async (row) => {
      const { data, error } = await db.from('ghg_inventories').insert(row).select('id').single()
      return error || !data ? { error: error ?? { message: 'no inventory row returned' } } : { id: data.id as string }
    },
    replaceFreeInventory: async (id, row) => {
      const { data, error } = await db.from('ghg_inventories').update(row).eq('id', id).eq('free_tier', true).select('id')
      return error ? { error } : { updated: (data ?? []).length }
    },
    getPendingById: async (id) => {
      const { data } = await admin.from('free_calc_pending').select(PENDING_COLUMNS).eq('id', id).maybeSingle()
      return (data as PendingRow | null) ?? null
    },
    latestPending: async (emailKey) => {
      const { data } = await admin.from('free_calc_pending').select(PENDING_COLUMNS)
        .eq('email_key', emailKey).order('created_at', { ascending: false }).limit(1).maybeSingle()
      return (data as PendingRow | null) ?? null
    },
    deletePendingForEmail: async (emailKey) => {
      const { error } = await admin.from('free_calc_pending').delete().eq('email_key', emailKey)
      if (error) throw new Error(error.message)
    },
    upsertProfile: async (p) => {
      const { data: existing } = await admin.from('profiles').select('id, signup_source').eq('id', p.id).maybeSingle()
      const fields = {
        ...(p.fullName ? { full_name: p.fullName } : {}),
        ...(p.company ? { company: p.company } : {}),
        ...(p.country ? { country: p.country } : {}),
        updated_at: new Date().toISOString(),
      }
      const { error } = existing
        ? await admin.from('profiles').update({ ...fields, signup_source: (existing.signup_source as string | null) ?? 'free_calc' }).eq('id', p.id)
        : await admin.from('profiles').insert({ id: p.id, email: p.email, signup_source: 'free_calc', ...fields })
      if (error) throw new Error(error.message)
    },
    // L5: the results email (lib/ghg/resultsEmail.ts), from the row as saved, read as the user.
    readSavedRow: async (id) => {
      const { data, error } = await db.from('ghg_inventories').select(RESULTS_EMAIL_COLUMNS).eq('id', id).maybeSingle()
      if (error) console.error('[free-calc/claim] saved row read failed:', error.message)
      return (data as SavedInventoryRow | null) ?? null
    },
    profileFullName: async () => {
      const { data } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle()
      return (data?.full_name as string | null | undefined) ?? null
    },
    sendResults: (to, email) => sendResultsEmail(to, email),
    siteUrl: SITE_ORIGIN,
    // L6: marketing consent (marketing_consents, service role only: docs/review/patches/L6-M5-marketing-consents.sql).
    requestMeta: { ip: ipFromHeaders(req), userAgent: req.headers.get('user-agent') },
    insertConsent: async (row) => {
      const { data, error } = await admin.from('marketing_consents').insert(row).select('id').single()
      return error || !data ? { error: error?.message ?? 'no row returned' } : { id: data.id as string }
    },
    activeConsentId: async () => {
      const { data, error } = await admin.from('marketing_consents').select('id, granted, created_at, withdrawn_at')
        .eq('user_id', userId).eq('purpose', 'updates').order('created_at', { ascending: false }).limit(20)
      if (error) { console.error('[free-calc/claim] consent read failed:', error.message); return null }
      return activeConsent((data ?? []) as ConsentRow[])?.id ?? null
    },
  })
  return NextResponse.json(result.body, { status: result.status })
}
