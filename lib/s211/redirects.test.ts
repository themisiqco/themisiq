import { describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'

describe('the builder moved to /dashboard/forced-labour', () => {
  it('/dashboard/s211 and every path under it redirect permanently', async () => {
    const r = await nextConfig.redirects!()
    expect(r).toContainEqual({ source: '/dashboard/s211', destination: '/dashboard/forced-labour', permanent: true })
    expect(r).toContainEqual({ source: '/dashboard/s211/:path*', destination: '/dashboard/forced-labour/:path*', permanent: true })
  })

  it('the free check moved under Canada, permanently (Stage 5c)', async () => {
    expect(await nextConfig.redirects!()).toContainEqual({ source: '/forced-labour/check', destination: '/forced-labour/canada/check', permanent: true })
  })
})
