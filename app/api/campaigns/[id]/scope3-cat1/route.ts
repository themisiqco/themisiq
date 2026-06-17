// app/api/campaigns/[id]/scope3-cat1/route.ts
// ThemisIQ — Supplier-data -> Scope 3 Category 1 aggregate (the "bridge").
//
// Reads a campaign's completed supplier responses + buyer-recorded spend and
// computes a hybrid Cat 1 figure per the GHG Protocol Scope 3 Technical Guidance
// (Category 1): supplier-specific where the supplier reported an ALLOCATED figure
// (emissions attributable to THIS buyer's purchases), spend-based estimate as the
// gap-fill for the rest, and an explicit "uncovered" list for suppliers we can do
// neither for. Returns a per-supplier breakdown so the figure is fully auditable.
//
// METHODOLOGY NOTES (kept honest on purpose):
//  - The allocated figure is what the supplier themselves attributed to this buyer
//    (supplier-allocation approach). We do NOT sum supplier org-totals — that would
//    overstate Cat 1.
//  - Spend-based fallback uses the SHARED emission factors (lib/emissionFactors.ts),
//    the same the calculator uses, so the bridge and the calculator never diverge.
//  - Sector for the spend-based EF is not captured per supplier in the Portal, so we
//    use the documented conservative default 'Other' (DEFAULT_SPEND_EF). The buyer
//    can refine in the calculator.
//  - Spend currency is FLAGGED, never silently FX-converted. If spend is non-USD we
//    surface it and exclude it from the auto-total, because the EF is per-USD.
//  - Nothing here is final: the figure is a SUGGESTION the buyer reviews and can edit
//    in the calculator before it enters the inventory.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../../lib/supabaseAuthed'
import { EMISSION_FACTORS, DEFAULT_SPEND_EF } from '../../../../../lib/emissionFactors'

// Response question ids written by the supplier form (both templates).
const Q_ALLOCATED = 's3cat1_allocated'
const Q_METHOD = 's3cat1_method'
const Q_QUALITY = 's3cat1_quality'

type LineMethod = 'supplier-specific' | 'spend-based'

interface CatOneLine {
  supplier_id: string
  supplier_name: string
  method: LineMethod
  data_quality: string        // supplier's stated basis, or 'Estimated (spend-based)'
  value_mt: number            // contribution in mt CO2e
  basis: string               // human-readable workings string for the audit trail
  allocation_method?: string  // supplier's free-text "how I allocated" (if given)
}

interface UncoveredLine {
  supplier_id: string
  supplier_name: string
  reason: string
}

interface CurrencyFlag {
  supplier_id: string
  supplier_name: string
  spend: number
  currency: string
  note: string
}

function num(v: string | null | undefined): number | null {
  if (v == null) return null
  const t = String(v).trim()
  if (t === '') return null
  const n = Number(t)
  return isNaN(n) ? null : n
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params

  try {
    const { supabase, userId } = await getAuthedClient(bearerFrom(req))

    // Confirm the campaign belongs to this buyer (RLS will also enforce, but we
    // want a clean 404 rather than an empty aggregate if it isn't theirs).
    const { data: campaign, error: campErr } = await supabase
      .from('supplier_campaigns')
      .select('id, name, buyer_id, reporting_year')
      .eq('id', campaignId)
      .single()

    if (campErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    if (campaign.buyer_id !== userId) {
      return NextResponse.json({ error: 'Not your campaign' }, { status: 403 })
    }

    // Suppliers in this campaign (with buyer-recorded spend).
    const { data: suppliers, error: supErr } = await supabase
      .from('campaign_suppliers')
      .select('id, supplier_name, status, annual_spend, spend_currency')
      .eq('campaign_id', campaignId)

    if (supErr) {
      return NextResponse.json({ error: supErr.message }, { status: 500 })
    }

    const supplierList = suppliers || []
    const supplierIds = supplierList.map((s) => s.id)

    // All responses for these suppliers in one query.
    const responsesBySupplier: Record<string, Record<string, string>> = {}
    if (supplierIds.length > 0) {
      const { data: responses } = await supabase
        .from('supplier_responses')
        .select('campaign_supplier_id, question_id, response')
        .in('campaign_supplier_id', supplierIds)

      for (const r of responses || []) {
        const sid = r.campaign_supplier_id as string
        if (!responsesBySupplier[sid]) responsesBySupplier[sid] = {}
        responsesBySupplier[sid][r.question_id as string] = r.response as string
      }
    }

    const lines: CatOneLine[] = []
    const uncovered: UncoveredLine[] = []
    const currencyFlags: CurrencyFlag[] = []

    for (const s of supplierList) {
      const resp = responsesBySupplier[s.id] || {}
      const allocated = num(resp[Q_ALLOCATED])
      const quality = resp[Q_QUALITY] || ''
      const method = resp[Q_METHOD] || ''

      // 1) Supplier-specific (primary): they reported an allocated figure.
      if (allocated != null && allocated > 0) {
        lines.push({
          supplier_id: s.id,
          supplier_name: s.supplier_name,
          method: 'supplier-specific',
          data_quality: quality || 'Supplier-reported (basis unspecified)',
          value_mt: allocated,
          basis: `Supplier-reported allocated emissions: ${allocated} mt CO2e${method ? ` (allocated by ${method})` : ''}`,
          allocation_method: method || undefined,
        })
        continue
      }

      // 2) Spend-based gap-fill: buyer recorded spend for this supplier.
      const spend = s.annual_spend != null ? Number(s.annual_spend) : null
      const currency = (s.spend_currency || 'USD').toUpperCase()

      if (spend != null && spend > 0) {
        if (currency !== 'USD') {
          // Honest currency handling: do not silently FX-convert into a USD-based EF.
          currencyFlags.push({
            supplier_id: s.id,
            supplier_name: s.supplier_name,
            spend,
            currency,
            note: `Spend recorded in ${currency}. The spend-based factor is per-USD; convert to USD before including, or ask the supplier for an allocated figure.`,
          })
          uncovered.push({
            supplier_id: s.id,
            supplier_name: s.supplier_name,
            reason: `Spend is in ${currency} (not USD) — excluded from the auto-total pending conversion.`,
          })
          continue
        }

        const ef = EMISSION_FACTORS.spend['Other'] ?? DEFAULT_SPEND_EF // documented conservative default
        const valueMt = (spend * ef) / 1000 // kg -> mt
        lines.push({
          supplier_id: s.id,
          supplier_name: s.supplier_name,
          method: 'spend-based',
          data_quality: 'Estimated (spend-based, sector: Other)',
          value_mt: valueMt,
          basis: `Spend-based estimate: ${spend} USD x ${ef} kg/USD (sector default 'Other') / 1000 = ${valueMt.toFixed(3)} mt CO2e`,
        })
        continue
      }

      // 3) Uncovered: no allocated figure and no spend.
      uncovered.push({
        supplier_id: s.id,
        supplier_name: s.supplier_name,
        reason: s.status !== 'completed'
          ? `Questionnaire ${s.status} — no allocated figure submitted yet`
          : 'No allocated emissions reported and no spend recorded',
      })
    }

    const supplierSpecificMt = lines
      .filter((l) => l.method === 'supplier-specific')
      .reduce((sum, l) => sum + l.value_mt, 0)
    const spendBasedMt = lines
      .filter((l) => l.method === 'spend-based')
      .reduce((sum, l) => sum + l.value_mt, 0)
    const totalMt = supplierSpecificMt + spendBasedMt

    return NextResponse.json({
      campaign: { id: campaign.id, name: campaign.name, reporting_year: campaign.reporting_year },
      total_mt: Number(totalMt.toFixed(3)),
      supplier_specific_mt: Number(supplierSpecificMt.toFixed(3)),
      spend_based_mt: Number(spendBasedMt.toFixed(3)),
      counts: {
        suppliers_total: supplierList.length,
        supplier_specific: lines.filter((l) => l.method === 'supplier-specific').length,
        spend_based: lines.filter((l) => l.method === 'spend-based').length,
        uncovered: uncovered.length,
      },
      lines,
      uncovered,
      currency_flags: currencyFlags,
      method_note:
        "Hybrid Cat 1 (GHG Protocol): supplier-specific where a supplier reported emissions attributable to your purchases; spend-based estimate (sector default 'Other') otherwise. Non-USD spend is flagged, not auto-converted. Review and adjust before finalising.",
    })
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Unexpected error computing Cat 1 aggregate' }, { status: 500 })
  }
}
