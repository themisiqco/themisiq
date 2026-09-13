// Sitemap for the public marketing and policy pages, served at /sitemap.xml and
// advertised by app/robots.ts. One entry per indexable route, built from BASE so the
// host is written once rather than twenty-three times.
//
// lastModified, changeFrequency and priority are deliberately omitted rather than
// forgotten. All three are hints a crawler is free to ignore, and each would have to be
// kept true by hand: a lastModified that never moves is worse than no date at all, and
// priority is relative within a single site, so it tells a crawler nothing it cannot
// already see. A bare list of URLs is the part that is both accurate and maintainable.

import type { MetadataRoute } from 'next'

const BASE = 'https://www.themisiq.co'

const ROUTES = [
  '/',
  '/advisory',
  '/ai-governance',
  '/assess',
  '/calculate-emissions',
  '/cbam',
  '/cbam/preview',
  '/cbam/readiness',
  '/climate-ghg',
  '/climate-risk',
  '/cyber',
  '/deals',
  '/frameworks',
  '/materiality',
  '/methodology',
  '/people',
  '/pricing',
  '/privacy',
  '/refund-policy',
  '/security',
  '/supply-chain',
  '/terms',
  '/trust',
]

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(path => ({ url: `${BASE}${path}` }))
}
