// app/api/forced-labour/countries/route.ts
// GET: the countries this account's builder shows (lib/forcedLabour/countryGate.ts). A country in preview is
// listed only for an account on the preview list; to everyone else this answer is as if it did not exist.
import { NextResponse } from 'next/server'
import { requireS211 } from '@/lib/s211/server'
import { visibleCountries } from '@/lib/forcedLabour/countryGate'

export async function GET(req: Request) {
  const gate = await requireS211(req, 'read')
  if (!gate.ok) return gate.response
  const countries = (await visibleCountries(gate.supabase)).map(({ key, name, law, shortName }) => ({ key, name, law, shortName }))
  return NextResponse.json({ countries })
}
