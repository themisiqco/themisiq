// app/api/materiality/reference/route.ts
// ThemisIQ — public reference data for the climate-risk / materiality wizard.
//
// The wizard is a CLIENT component; it cannot read the mr_* tables directly under RLS the way the
// server-side scoring routes do. This GET route hands it the lists it needs to build its dropdowns
// from the DB — so the geography (and other option lists) live in ONE place (the database), not
// hardcoded in the component where they silently drift from the model.
//
// All four tables are PUBLIC reference data (anon SELECT already granted), so this needs no auth —
// an anon client is sufficient and keeps it callable before the client's session is fully hydrated.
//
// Route Handlers are not cached by default (Next 16), so each request reflects the current DB.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const [regionsRes, industriesRes, jurisdictionsRes, scenariosRes, topicsRes] = await Promise.all([
      supabase.from('mr_regions')
        .select('code, label, continent, sort_order')
        .eq('active', true)
        .order('sort_order'),
      supabase.from('mr_industries').select('code, label, carbon_exposure').order('label'),
      supabase.from('mr_jurisdictions').select('code, label, policy_intensity').order('label'),
      supabase.from('mr_scenarios').select('code, label, framework, descriptor, physical_mult, transition_mult'),
      // The ten topical standards. FATAL if it fails: without them the wizard's impact step has
      // no topics to score at all, which is not a degraded state — it is a broken one.
      supabase.from('mr_esrs_topics').select('code, label, category, sort_order').order('sort_order'),
    ])

    const firstErr = [regionsRes, industriesRes, jurisdictionsRes, scenariosRes, topicsRes].find(r => r.error)
    if (firstErr?.error) {
      console.error('Materiality reference-route fetch error:', firstErr.error)
      return NextResponse.json({ error: 'Failed to load reference data' }, { status: 500 })
    }

    // ── Per-version topic labels — DELIBERATELY OUTSIDE the fatal set above ──
    // Every select in that Promise.all is fatal on error (firstErr -> 500), and the wizard's
    // handler for a failed reference fetch is a bare `if (!res.ok) return` — so a 500 here leaves
    // regionGroups EMPTY and the region dropdown silently blank. A topic-LABEL outage must never
    // do that: it would take out the geography picker for want of a display name.
    //
    // So this degrades instead. An empty array means the client falls back per-topic to
    // mr_esrs_topics.label — the same pre-versioning default /api/materiality uses — and the
    // wizard stays fully usable with 2023 wording rather than not loading.
    //
    // ALL versions are returned unfiltered, not just the one the user has picked: the whole table
    // is 10 rows today and 30 fully seeded, so the client filters in memory and a version change
    // is instant with no refetch, no loading state, and no window where names are stale.
    const labelsRes = await supabase
      .from('mr_esrs_topic_labels')
      .select('topic_code, standard_version, label')
    if (labelsRes.error) {
      console.error(
        'Materiality reference-route: mr_esrs_topic_labels fetch failed; serving [] so the client '
        + 'falls back to mr_esrs_topics.label. Region and industry lists are unaffected.',
        labelsRes.error,
      )
    }

    return NextResponse.json({
      regions: regionsRes.data ?? [],
      industries: industriesRes.data ?? [],
      jurisdictions: jurisdictionsRes.data ?? [],
      scenarios: scenariosRes.data ?? [],
      topics: topicsRes.data ?? [],
      // [] means "no version-specific names available" — from an empty table OR a failed read.
      // The client cannot tell those apart and must not claim to: it reports the fallback as a
      // fallback, never as a reason. (Same discipline as labelResolution in /api/materiality.)
      topicLabels: labelsRes.data ?? [],
    })
  } catch (error) {
    console.error('Materiality reference route error:', error)
    return NextResponse.json({ error: 'Failed to load reference data' }, { status: 500 })
  }
}
