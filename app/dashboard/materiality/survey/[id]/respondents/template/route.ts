// app/dashboard/materiality/survey/[id]/respondents/template/route.ts
//
// GET …/respondents/template?format=xlsx — the respondent-list template for one round.
//
// XLSX only. See the note at the format check for why the CSV template was removed, and why CSV
// UPLOAD is unaffected.
//
// ⚠️ WHY THIS IS A ROUTE AND NOT A BROWSER BLOB, WHICH IS WHAT IT WAS.
// The first version generated the file client-side and handed it to a detached <a>. It carried two
// defects that both present as "the button does nothing":
//   * the anchor was never appended to the document — Chrome tolerates that, Firefox does not; and
//   * URL.revokeObjectURL was called synchronously after .click(), which can abort the download
//     before the browser has finished reading the blob.
// Generating server-side removes the workbook assembly from the browser entirely. The client still
// turns the response into a download, so the anchor handling is fixed there too — but the file now
// exists whether or not that step behaves.
//
// AUTHENTICATED, because the template carries THIS ROUND'S question counts — "Own workforce · 31
// questions" moves when the scope screen moves, and a template quoting 31 for a round scoped to 22
// would be worse than one quoting nothing. That means a bearer token, which a plain <a href> cannot
// send, so the client fetches and downloads the blob. It is not a shareable URL and should not
// become one: the counts are a customer's own scoping decision.
//
// The category list is generated from mr_stakeholder_categories, never hardcoded, so it moves when
// the table moves.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../../../../lib/supabaseAuthed'
import {
  categoryReference, deriveQuestionCounts, CATEGORY_MEANING, CATEGORY_COLUMNS_LINE_FILE,
  CATEGORY_TYPE_EXACTLY, TEMPLATE_HEADERS,
  type CategoryRef,
} from '../../../../../../../lib/materiality/respondentImport'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const format = (new URL(req.url).searchParams.get('format') || 'xlsx').toLowerCase()

  let authed
  try {
    authed = await getAuthedClient(bearerFrom(req))
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  }
  const { supabase } = authed

  // RLS scopes this; a round belonging to another account simply returns no rows.
  const { data: round, error: rErr } = await supabase
    .from('materiality_survey_rounds')
    .select('id, name, questionnaire_version, standard_version')
    .eq('id', id).maybeSingle()

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  if (!round) return NextResponse.json({ error: 'Survey round not found, or it belongs to another account.' }, { status: 404 })

  const [ct, qs, subs] = await Promise.all([
    supabase.from('mr_stakeholder_categories')
      .select('code, label, track, labour_routing, typically_surveyed').order('sort_order'),
    supabase.from('materiality_survey_questions')
      .select('subtopic_code, status')
      .eq('round_id', id).eq('questionnaire_version', round.questionnaire_version),
    supabase.from('mr_esrs_subtopics').select('code, topic_code')
      .eq('standard_version', round.standard_version),
  ])

  if (ct.error) return NextResponse.json({ error: ct.error.message }, { status: 500 })
  const cats = (ct.data ?? []) as CategoryRef[]
  if (!cats.length) {
    // An empty category list would produce a template whose reference sheet is blank — a file that
    // looks complete and teaches nothing. Refuse and say why.
    return NextResponse.json({ error: 'No stakeholder categories are seeded, so a template cannot be built.' }, { status: 500 })
  }

  const topicOf = Object.fromEntries(((subs.data ?? []) as any[]).map(s => [s.code, s.topic_code]))
  const counts = deriveQuestionCounts((qs.data ?? []) as any[], topicOf)
  const reference = categoryReference(cats, counts)

  const stamp = new Date().toISOString().slice(0, 10)
  const safe = (round.name || 'survey').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40)

  // ⚠️ XLSX ONLY. A CSV template used to be offered here and was removed: a CSV can carry the three
  // header words and nothing else, so everything that makes the template useful — the
  // how-to-fill-this-in column and the eleven-code Categories sheet — was missing from exactly the
  // download most likely to be filled in by hand. CSV UPLOAD is unaffected and remains supported.
  if (format !== 'xlsx') {
    return NextResponse.json({
      error: format === 'csv'
        ? 'The template is only available as .xlsx — a CSV cannot carry the category list or the guidance. You can still UPLOAD a .csv of your own list.'
        : `Unknown format "${format}". The template is .xlsx.`,
    }, { status: 400 })
  }

  // Dynamic, as app/dashboard/cbam/report/exportXlsx.ts does it.
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const wrap = (t: string) => (t.match(/.{1,92}(\s|$)/g) ?? [t]).map(l => l.trim())

  // ⚠️ SHEET 1 CARRIES THE EXPLANATION TOO, BECAUSE NUMBERS ONLY OPENS SHEET 1.
  // Verified in testing on macOS: a customer opening this in Numbers sees a bare three-column header
  // and never discovers the Categories sheet. So the guidance sits in column E of the first sheet,
  // where every application shows it.
  // ⚠️ IT MUST START IN ROW 1 AND STAY OUT OF COLUMNS A-C. The header has to be row 1 or the import
  // parser cannot find it, and any text in A-C below row 1 would parse as a person. Column E rows
  // are dropped by buildRows, which discards records with neither a name nor an email.
  const sheet1: (string | number)[][] = [
    [...TEMPLATE_HEADERS, '', 'HOW TO FILL THIS IN'],
    ['', '', '', '', CATEGORY_COLUMNS_LINE_FILE],
    ['', '', '', '', ''],
    ...wrap(CATEGORY_MEANING).map(l => ['', '', '', '', l]),
    ['', '', '', '', ''],
    ...wrap(CATEGORY_TYPE_EXACTLY).map(l => ['', '', '', '', l]),
    ['', '', '', '', ''],
    ['', '', '', '', 'The codes are listed on the Categories sheet of this workbook.'],
    ['', '', '', '', 'If your app does not show that sheet, the codes are also on the import screen.'],
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1)
  ws1['!cols'] = [{ wch: 26 }, { wch: 30 }, { wch: 24 }, { wch: 3 }, { wch: 96 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Respondents')

  // The same explanation, above the table, on the sheet that lists the codes.
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['What a category is, and why it matters'],
    [],
    [CATEGORY_COLUMNS_LINE_FILE],
    [],
    ...wrap(CATEGORY_MEANING).map(l => [l]),
    [],
    ...wrap(CATEGORY_TYPE_EXACTLY).map(l => [l]),
    [],
    ['code', 'label', 'questions asked', 'what it means'],
    ...reference.map(r => [r.code, r.label, r.asked, r.note]),
  ])
  ws2['!cols'] = [{ wch: 26 }, { wch: 46 }, { wch: 16 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Categories')

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="respondents-${safe}-${stamp}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
