// app/api/cbam/report/route.ts
// ThemisIQ — CBAM §1.2 SUMMARY emissions report (IR 2025/2547 Annex IV §1.2), for one installation +
// reporting period. This is the importer-facing summary: it is DISCLOSURE-BOUNDED — only the fields
// §1.2 exposes. The §1.1 FULL operator report is a SEPARATE, future surface and must NEVER be served
// here: §1.1 carries fields the operator may legitimately withhold from the importer, so serving §1.1
// content from this route would leak them. Keep this route strictly §1.2.
//
// Keyed on the INSTALLATION, not on a single see_record: buildSummaryReport takes goods[] and gates
// items 5/6 (installation-level totals) on installationProcessesComplete, because a single process's
// figures must never be presented as an installation total.
//
// Flow (house pattern — mirrors app/api/cbam/compute/route.ts: bearerFrom + getAuthedClient, try/catch,
// NextResponse.json({error},{status}), AuthError -> 401, ProcessLoadError mapped by code, generic 500):
//   1. Validate installation_id + reporting_period.
//   2. Load installation / operator profile / disclosures / processes in parallel (RLS-scoped).
//   3. For each process, recompute via the SAME spine the compute route uses (loadAndComputeProcess),
//      load its latest see_record, and TRIPWIRE the stored figures against the recomputation.
//   4. Build GoodComputation[] and hand the fetched rows to buildSummaryReport.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed';
import { loadAndComputeProcess, ProcessLoadError } from '../../../../lib/cbam/loadProcess';
import { buildSummaryReport } from '../../../../lib/cbam/report/build';
import { seeRecordMatches } from '../../../../lib/cbam/seeMatch';
import type {
  GoodComputation, SeeRecordRow, OperatorProfileRow, InstallationRow, DisclosuresRow,
} from '../../../../lib/cbam/report/build';

// A stale-record conflict: a persisted see_record no longer matches a recomputation. Same shape as
// ProcessLoadError (a named Error carrying a code, NOT an HTTP status — the caller maps to 409).
class ReportError extends Error {
  constructor(message: string, public code: 'stale_record') {
    super(message);
    this.name = 'ReportError';
  }
}

// The cbam_production_processes columns this route needs to enumerate the installation's processes.
interface ProcessListRow {
  id: string;
  route_code: string | null;
  cn_code: string | null;
}

// cbam_installation_disclosures as loaded here: the §1.2 (7)-(11) disclosure columns (DisclosuresRow)
// plus the processes_complete attestation and its own audit timestamp (not part of the builder input).
type DisclosuresWithAttestation = DisclosuresRow & {
  processes_complete: boolean | null;
  processes_complete_declared_at: string | null;
};

// A fetched see_record: the fields the builder reads (SeeRecordRow) plus id/computed_at for the tripwire
// message. see_direct/see_indirect are NOT NULL in the DB and come back as JS numbers.
type SeeRecordFetched = SeeRecordRow & { id: string; computed_at: string };

export async function GET(req: NextRequest) {
  try {
    // ── 1. Authenticate as the user (RLS applies as this user — these are per-customer tables) ──
    const token = bearerFrom(req);
    const { supabase } = await getAuthedClient(token);

    // ── Parse & validate query params ────────────────────────────────
    const params = req.nextUrl.searchParams;
    const installationId = (params.get('installation_id') ?? '').trim();
    const reportingPeriodRaw = (params.get('reporting_period') ?? '').trim();
    if (!installationId) {
      return NextResponse.json({ error: 'installation_id is required' }, { status: 400 });
    }
    const reportingPeriod = Number(reportingPeriodRaw);
    if (!reportingPeriodRaw || !Number.isInteger(reportingPeriod)) {
      return NextResponse.json({ error: 'reporting_period must be an integer' }, { status: 400 });
    }

    // ── 2. Load in parallel (RLS scopes all of these to the owner) ───
    // operator_profile is keyed 1:1 on the company and RLS-scoped to the owner's company, so a bare
    // select + maybeSingle returns exactly the owner's profile — no company_id filter needed, and it
    // errors (rather than picking one) in the impossible multi-company case rather than guessing.
    // operator and disclosures may legitimately be absent — the builder accepts null and reports the
    // affected fields as missing. Do NOT substitute defaults for an absent row.
    const [installationRes, operatorRes, disclosuresRes, processesRes] = await Promise.all([
      supabase
        .from('cbam_installations')
        .select('name, cbam_registry_id, un_locode, address_line1, address_line2, city, postcode, country, latitude, longitude')
        .eq('id', installationId)
        .maybeSingle(),
      supabase
        .from('cbam_operator_profile')
        .select('operator_name, registration_no, address_line1, address_line2, city, postcode, country')
        .maybeSingle(),
      supabase
        .from('cbam_installation_disclosures')
        .select('heat_imported, heat_exported, zero_rated_fuels_used, zero_rated_fuels_demonstration, waste_gases_produced_used, waste_gases_imported, waste_gases_exported, co2_capture_used, co2_capture_transferred_to, electricity_produced_onsite, elec_cogeneration, elec_separate_generation, elec_source_fossil, elec_source_renewable, elec_exported_from_process, processes_complete, processes_complete_declared_at')
        .eq('installation_id', installationId)
        .eq('reporting_period', reportingPeriod)
        .maybeSingle(),
      supabase
        .from('cbam_production_processes')
        .select('id, route_code, cn_code')
        .eq('installation_id', installationId)
        .eq('reporting_period', reportingPeriod),
    ]);

    if (installationRes.error || operatorRes.error || disclosuresRes.error || processesRes.error) {
      console.error(
        'CBAM report load error:',
        installationRes.error || operatorRes.error || disclosuresRes.error || processesRes.error,
      );
      return NextResponse.json({ error: 'Failed to load report inputs' }, { status: 500 });
    }
    if (!installationRes.data) {
      // Not found OR not owned — RLS makes those indistinguishable, which is correct.
      return NextResponse.json({ error: 'Installation not found' }, { status: 404 });
    }

    const processRows = (processesRes.data ?? []) as ProcessListRow[];
    if (processRows.length === 0) {
      return NextResponse.json(
        { error: 'No processes found for this installation and reporting period' },
        { status: 404 },
      );
    }

    const installation = installationRes.data as InstallationRow;
    const operator = (operatorRes.data ?? null) as OperatorProfileRow | null;
    const disclosures = (disclosuresRes.data ?? null) as DisclosuresWithAttestation | null;

    // ── 3. Per process: recompute via the shared spine, load latest see_record, TRIPWIRE ──
    const processesWithoutRecord: string[] = [];
    const goods: GoodComputation[] = await Promise.all(
      processRows.map(async (p): Promise<GoodComputation> => {
        // Step 4 — the SAME spine the compute route runs. Recomputed figures are byte-identical
        // because both paths run this identical code in the same order.
        const loaded = await loadAndComputeProcess(supabase, p.id);

        // Step 5 — the latest see_record for this process. cbam_see_records is append-only with no
        // supersession marker, so "current" is defined as the most recently computed row: order by
        // computed_at desc, take one. A process with NO record is not an error — its figures come
        // through as missing, and its id is surfaced in processesWithoutRecord.
        const { data: recordData, error: recordErr } = await supabase
          .from('cbam_see_records')
          .select('id, see_direct, see_indirect, default_share_direct, default_share_indirect, sefa, sefa_status, workings, computed_at')
          .eq('process_id', p.id)
          .order('computed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recordErr) {
          console.error('CBAM report see_record load error:', recordErr);
          throw new Error(`Failed to load see_record for process ${p.id}`);
        }
        const record = (recordData ?? null) as SeeRecordFetched | null;

        if (!record) {
          processesWithoutRecord.push(p.id);
        } else if (
          // Step 6 — TRIPWIRE. seeRecordMatches compares both legs within a small float64 tolerance
          // (see lib/cbam/seeMatch.ts): the stored figure and this recomputation run the SAME engine
          // via loadAndComputeProcess, so they agree to within ~1 ULP of summation-order drift unless
          // reference data or process inputs genuinely changed since the record was written. Real
          // divergence is orders of magnitude larger than the tolerance and still throws. A figure
          // that disagrees with the stored record is NEVER returned.
          !seeRecordMatches(
            { direct: record.see_direct, indirect: record.see_indirect },
            loaded.result,
          )
        ) {
          throw new ReportError(
            `see_record ${record.id} for process ${p.id} is stale: ` +
              `stored (direct=${record.see_direct}, indirect=${record.see_indirect}) != ` +
              `recomputed (direct=${loaded.result.direct}, indirect=${loaded.result.indirect}); ` +
              `computed_at=${record.computed_at}. Reference data or process inputs have changed since ` +
              `this record was computed — re-run compute to produce a new record before generating the report.`,
            'stale_record',
          );
        }

        // Step 7 — one GoodComputation. Zip precursors with precursorRows BY INDEX in a single pass;
        // never sort or filter either array first — that would break the object-identity keying of
        // result.resolutions (invariant 10). loaded.precursors[i] is the adapted loaded.precursorRows[i].
        return {
          processId: p.id,
          cnCode: loaded.process.cn_code,
          annexIiDirectOnly: loaded.annexIiDirectOnly,
          activityLevel: loaded.activityLevel,
          aeG: loaded.result.aeG,
          attrEm: loaded.attrEm,
          seeRecord: record,   // superset of SeeRecordRow (extra id/computed_at) — structurally fine
          precursors: loaded.precursors.map((precursor, i) => {
            const row = loaded.precursorRows[i];
            return {
              precursor,
              origin: {
                operatorName: row.origin_operator_name,
                installationName: row.origin_installation_name,
                cbamRegistryId: row.origin_cbam_registry_id,
                reportingPeriod: row.origin_reporting_period,
              },
            };
          }),
          resolutions: loaded.result.resolutions,
        };
      }),
    );

    // ── 8. installationProcessesComplete is the operator's ATTESTATION (DB-trigger enforced), never
    // inferred from row counts. null or false -> false. ──
    const installationProcessesComplete = disclosures?.processes_complete === true;

    // ── 9. Build the §1.2 summary from the fetched rows ──────────────
    const { report, missing, completeness } = buildSummaryReport({
      operator,
      installation,
      processes: processRows.map((p) => ({ process_id: p.id, route_code: p.route_code, cn_code: p.cn_code })),
      disclosures,
      goods,
      installationProcessesComplete,
    });

    // ── 10. Return. `missing` is the fail-loud channel — return it prominently, never suppress it.
    // processesWithoutRecord tells the caller the report is not fully backed by computed records. ──
    return NextResponse.json({
      report,
      missing,
      // completeness carries the denominator AND the operator/platform/regulator split.
      // `missing` remains the flat fail-loud channel and is unchanged — completeness is
      // strictly additive, so nothing that reads `missing` today is affected.
      completeness,
      processesWithoutRecord,
      processesCompleteDeclaredAt: disclosures?.processes_complete_declared_at ?? null,
    });

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ProcessLoadError) {
      // Same codes/strings the compute route maps: not_found -> 404, invalid_input -> 400, else 500.
      const status = error.code === 'not_found' ? 404 : error.code === 'invalid_input' ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof ReportError) {
      // stale_record -> 409 Conflict. The stored record disagrees with a recomputation; never serve it.
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('CBAM report route error:', error);
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 });
  }
}
