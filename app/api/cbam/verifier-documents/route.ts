// app/api/cbam/verifier-documents/route.ts
// ThemisIQ — CBAM verifier documents + §1.2 report endpoint. The SERVICE-ROLE read path for a
// consented third-party verifier: it returns the disclosure-bounded §1.2 summary report plus
// short-lived signed URLs to the installation's CBAM evidence documents.
//
// SECURITY MODEL — read before touching any query in here:
//   • The token is the ONLY client input. installation_id / company_id / reporting_period come
//     from the cbam_verifier_validate_token RPC, NEVER from the request body. Document file_paths
//     come from our OWN scoped query, NEVER from the body. This is the invariant that stops a
//     verifier pivoting to another tenant's evidence — preserve it.
//   • createServerClient() is the SERVICE-ROLE client: it BYPASSES RLS. So unlike
//     app/api/cbam/report/route.ts (which leans on RLS and omits some company_id filters), EVERY
//     query here scopes explicitly to the validated (installation_id, company_id, reporting_period)
//     tuple. Do NOT copy the owner route's filters verbatim.
//   • HARD WALL: signed URLs are issued from the 'cbam-source-documents' bucket only. The GHG
//     'source-documents' bucket must never be reachable from a CBAM verifier grant.
//
// Flow: (1) validate token via RPC + consent gate → scope tuple; (2) load the five report tables,
// each explicitly tuple-scoped; (3) per process recompute via the shared spine, cross-tenant
// assert, and tripwire the stored see_record; (4) buildSummaryReport (the same pure builder the
// owner route uses); (5) collect docs reachable only from the scoped processes and sign them.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '../../../../lib/supabase';
import { loadAndComputeProcess, ProcessLoadError } from '../../../../lib/cbam/loadProcess';
import { buildSummaryReport } from '../../../../lib/cbam/report/build';
import { seeRecordMatches } from '../../../../lib/cbam/seeMatch';
import type {
  GoodComputation, SeeRecordRow, OperatorProfileRow, InstallationRow, DisclosuresRow,
} from '../../../../lib/cbam/report/build';

// Signed-URL minting moved OUT of this route: documents are returned as ids only and re-signed
// one-at-a-time on click by /api/cbam/verifier-documents/sign (which owns the bucket + TTL constants).

// A stale-record conflict: a persisted see_record no longer matches a recomputation. Same shape and
// meaning as the owner report route's ReportError — the caller maps it to 409.
class ReportError extends Error {
  constructor(message: string, public code: 'stale_record') {
    super(message);
    this.name = 'ReportError';
  }
}

// The cbam_production_processes columns needed to enumerate the installation's processes.
interface ProcessListRow {
  id: string;
  route_code: string | null;
  cn_code: string | null;
}

// cbam_installation_disclosures as loaded here: the §1.2 disclosure columns (DisclosuresRow) plus the
// processes_complete attestation and its audit timestamp (not part of the builder input).
type DisclosuresWithAttestation = DisclosuresRow & {
  processes_complete: boolean | null;
  processes_complete_declared_at: string | null;
};

// A fetched see_record: the fields the builder reads (SeeRecordRow) plus id/computed_at for the tripwire.
type SeeRecordFetched = SeeRecordRow & { id: string; computed_at: string };

// The RPC's jsonb return, three-state. Only the 'valid' state carries the scope tuple.
interface TokenValidation {
  status?: 'invalid' | 'consent_required' | 'valid';
  installation_id?: string;
  company_id?: string;
  reporting_period?: number;
  verifier_name?: string | null;
  installation_name?: string | null;
}

export async function POST(req: NextRequest) {
  // ── Parse the sole client input: the token. Nothing else is trusted from the body. ──
  let token: unknown;
  try {
    const body = await req.json();
    token = body?.token;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  }

  const admin = createServerClient();

  try {
    // ── 1. Validate the grant + consent via the SECURITY DEFINER RPC. The RPC is the ONLY source of
    // the scope tuple: it returns installation_id/company_id ONLY once accepted_at is set, so the
    // consent hard-gate is enforced at the data layer, not just here. ──
    const { data: validationData, error: rpcErr } = await admin.rpc('cbam_verifier_validate_token', {
      p_token: token,
    });
    if (rpcErr) {
      console.error('CBAM verifier validate RPC error:', rpcErr);
      return NextResponse.json({ error: 'validation_failed' }, { status: 500 });
    }
    const v = (validationData ?? {}) as TokenValidation;

    if (v.status === 'invalid') {
      return NextResponse.json({ error: 'invalid' }, { status: 403 });
    }
    if (v.status === 'consent_required') {
      return NextResponse.json({ error: 'consent_required' }, { status: 403 });
    }
    if (v.status !== 'valid') {
      // Unknown/absent status — fail closed rather than proceeding without a validated grant.
      return NextResponse.json({ error: 'invalid' }, { status: 403 });
    }

    const installationId = v.installation_id;
    const companyId = v.company_id;
    const reportingPeriod = v.reporting_period;
    // A 'valid' status without the full scope tuple is an internal contract violation, not a client
    // error — never continue with a partial scope.
    if (!installationId || !companyId || reportingPeriod == null) {
      console.error('CBAM verifier validate returned "valid" without a complete scope tuple');
      return NextResponse.json({ error: 'validation_failed' }, { status: 500 });
    }

    // ── 2. Load the five report tables, EACH explicitly scoped to the tuple (service role bypasses
    // RLS, so these filters are the only isolation). Column lists mirror the owner report route. ──
    const [installationRes, operatorRes, disclosuresRes, processesRes] = await Promise.all([
      admin
        .from('cbam_installations')
        .select('name, cbam_registry_id, un_locode, address_line1, address_line2, city, postcode, country, latitude, longitude')
        .eq('id', installationId)
        .eq('company_id', companyId)
        .maybeSingle(),
      admin
        .from('cbam_operator_profile')
        .select('operator_name, registration_no, address_line1, address_line2, city, postcode, country')
        .eq('company_id', companyId)   // REQUIRED here — the owner route omits it and leans on RLS.
        .maybeSingle(),
      admin
        .from('cbam_installation_disclosures')
        .select('heat_imported, heat_exported, zero_rated_fuels_used, zero_rated_fuels_demonstration, waste_gases_produced_used, waste_gases_imported, waste_gases_exported, co2_capture_used, co2_capture_transferred_to, electricity_produced_onsite, elec_cogeneration, elec_separate_generation, elec_source_fossil, elec_source_renewable, elec_exported_from_process, processes_complete, processes_complete_declared_at')
        .eq('installation_id', installationId)
        .eq('company_id', companyId)
        .eq('reporting_period', reportingPeriod)
        .maybeSingle(),
      admin
        .from('cbam_production_processes')
        .select('id, route_code, cn_code')
        .eq('installation_id', installationId)
        .eq('company_id', companyId)
        .eq('reporting_period', reportingPeriod),
    ]);

    if (installationRes.error || operatorRes.error || disclosuresRes.error || processesRes.error) {
      console.error(
        'CBAM verifier report load error:',
        installationRes.error || operatorRes.error || disclosuresRes.error || processesRes.error,
      );
      return NextResponse.json({ error: 'report_load_failed' }, { status: 500 });
    }
    if (!installationRes.data) {
      // The grant referenced an installation that no longer resolves under its own tuple.
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const processRows = (processesRes.data ?? []) as ProcessListRow[];
    if (processRows.length === 0) {
      return NextResponse.json({ error: 'no_processes' }, { status: 404 });
    }

    const installation = installationRes.data as InstallationRow;
    const operator = (operatorRes.data ?? null) as OperatorProfileRow | null;
    const disclosures = (disclosuresRes.data ?? null) as DisclosuresWithAttestation | null;
    const scopedProcessIds = processRows.map((p) => p.id);

    // ── 3. Per process: recompute via the shared spine, CROSS-TENANT ASSERT, load latest see_record,
    // TRIPWIRE against the stored figures. Mirrors app/api/cbam/report/route.ts step 4-7. ──
    const processesWithoutRecord: string[] = [];
    const goods: GoodComputation[] = await Promise.all(
      processRows.map(async (p): Promise<GoodComputation> => {
        const loaded = await loadAndComputeProcess(admin, p.id);

        // CROSS-TENANT GUARD (defense-in-depth): loadAndComputeProcess loads by process id ALONE and
        // does not re-check the tuple. Step 2 already scoped the id list, so a mismatch here should be
        // impossible — but if it ever fires it means a scoping assumption broke, and we must fail hard
        // rather than serve another tenant's figures.
        if (
          loaded.process.company_id !== companyId ||
          loaded.process.installation_id !== installationId ||
          loaded.process.reporting_period !== reportingPeriod
        ) {
          throw new Error(
            `cross-tenant guard tripped: process ${p.id} resolved to a scope ` +
              `(company=${loaded.process.company_id}, installation=${loaded.process.installation_id}, ` +
              `period=${loaded.process.reporting_period}) outside the verifier grant.`,
          );
        }

        // Latest see_record for this process (append-only, "current" = most recently computed).
        const { data: recordData, error: recordErr } = await admin
          .from('cbam_see_records')
          .select('id, see_direct, see_indirect, default_share_direct, default_share_indirect, sefa, sefa_status, workings, computed_at')
          .eq('process_id', p.id)
          .order('computed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recordErr) {
          console.error('CBAM verifier see_record load error:', recordErr);
          throw new Error(`Failed to load see_record for process ${p.id}`);
        }
        const record = (recordData ?? null) as SeeRecordFetched | null;

        if (!record) {
          processesWithoutRecord.push(p.id);
        } else if (
          // TRIPWIRE — the stored figure and this recomputation run the SAME engine, so they agree
          // to within float64 noise unless reference data or inputs genuinely changed. seeRecordMatches
          // tolerates ~1 ULP of summation-order drift (see lib/cbam/seeMatch.ts) but still fires on any
          // real divergence, which is orders of magnitude larger. A disagreeing figure is NEVER served.
          !seeRecordMatches(
            { direct: record.see_direct, indirect: record.see_indirect },
            loaded.result,
          )
        ) {
          throw new ReportError(
            `see_record ${record.id} for process ${p.id} is stale: ` +
              `stored (direct=${record.see_direct}, indirect=${record.see_indirect}) != ` +
              `recomputed (direct=${loaded.result.direct}, indirect=${loaded.result.indirect}); ` +
              `computed_at=${record.computed_at}.`,
            'stale_record',
          );
        }

        // One GoodComputation. Zip precursors with precursorRows BY INDEX (invariant 10) — never sort
        // or filter either array first.
        return {
          processId: p.id,
          cnCode: loaded.process.cn_code,
          annexIiDirectOnly: loaded.annexIiDirectOnly,
          activityLevel: loaded.activityLevel,
          aeG: loaded.result.aeG,
          attrEm: loaded.attrEm,
          seeRecord: record,
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

    // ── 4. Build the §1.2 summary. installationProcessesComplete is the operator's ATTESTATION
    // (DB-trigger enforced), null/false -> false. Same pure builder the owner route uses, unmodified. ──
    const installationProcessesComplete = disclosures?.processes_complete === true;
    const { report, missing, completeness } = buildSummaryReport({
      operator,
      installation,
      processes: processRows.map((p) => ({ process_id: p.id, route_code: p.route_code, cn_code: p.cn_code })),
      disclosures,
      goods,
      installationProcessesComplete,
    });

    // ── 5. Documents reachable ONLY from the scoped processes: cbam_source_streams.source_doc_id ->
    // cbam_source_documents, filtered to company_id AND the scoped process ids. All paths derived
    // server-side; the client never supplies one. ──
    const { data: streamRows, error: streamsErr } = await admin
      .from('cbam_source_streams')
      .select('source_doc_id')
      .eq('company_id', companyId)
      .in('process_id', scopedProcessIds);
    if (streamsErr) {
      console.error('CBAM verifier source_streams load error:', streamsErr);
      return NextResponse.json({ error: 'documents_load_failed' }, { status: 500 });
    }
    const docIds = Array.from(
      new Set((streamRows ?? []).map((r) => r.source_doc_id).filter((x): x is string => x != null)),
    );

    // Documents carry only their id + display fields — NO pre-baked signed URL and NO file_path.
    // The client re-signs one doc at a time on click via POST /api/cbam/verifier-documents/sign,
    // which re-validates token + consent + scope and mints a short-TTL URL. file_path never leaves
    // the server.
    let documents: { id: string; file_name: string; document_type: string }[] = [];
    if (docIds.length > 0) {
      const { data: docRows, error: docsErr } = await admin
        .from('cbam_source_documents')
        .select('id, file_path, file_name, document_type')
        .eq('company_id', companyId)
        .in('id', docIds);
      if (docsErr) {
        console.error('CBAM verifier source_documents load error:', docsErr);
        return NextResponse.json({ error: 'documents_load_failed' }, { status: 500 });
      }
      documents = (docRows ?? []).map((d) => ({
        id: d.id,
        file_name: d.file_name ?? 'document',
        document_type: d.document_type ?? 'document',
      }));
    }

    // ── 6. Respond. Report + gaps + signed documents + minimal verifier display context. NO raw
    // table rows, NO company_id, NO customer_user_id, NO file paths. `coverage` is the loud signal
    // that the report is not fully backed by computed records — counts only, never the internal ids. ──
    return NextResponse.json({
      report,
      missing,
      // Counts and the operator/platform/regulator split. Passes this route's
      // no-internal-ids rule: CompletenessItem carries the same item/field/hint strings
      // already present in `missing`, plus state and responsibility. No new exposure.
      completeness,
      documents,
      coverage: {
        processes_total: processRows.length,
        processes_without_record: processesWithoutRecord.length,
      },
      verifier: {
        verifier_name: v.verifier_name ?? null,
        installation_name: v.installation_name ?? null,
        reporting_period: reportingPeriod,
      },
    });

  } catch (error) {
    if (error instanceof ReportError) {
      // Stored record disagrees with a recomputation; never serve it.
      return NextResponse.json({ error: 'stale_record' }, { status: 409 });
    }
    if (error instanceof ProcessLoadError) {
      // Unlike the owner route (which maps this code to 404/400 for the requesting user), here the
      // process list was derived from our OWN scoped query — a load failure is a server-side fault,
      // and we deliberately do not leak which condition failed to an external verifier.
      console.error('CBAM verifier ProcessLoadError:', error);
      return NextResponse.json({ error: 'report_failed' }, { status: 500 });
    }
    console.error('CBAM verifier-documents route error:', error);
    return NextResponse.json({ error: 'report_failed' }, { status: 500 });
  }
}
