import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AUDIT_LOG_BASIS, auditTrailLine } from './auditTrailNotice'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('audit trail notice', () => {
  it('N1 the line pluralises and carries the basis', () => {
    expect(auditTrailLine(1)).toBe(`1 change logged · ${AUDIT_LOG_BASIS}`)
    expect(auditTrailLine(0)).toBe(`0 changes logged · ${AUDIT_LOG_BASIS}`)
    expect(auditTrailLine(12)).toBe(`12 changes logged · ${AUDIT_LOG_BASIS}`)
  })

  it('N2 ⚠️ it claims prevention, not detection', () => {
    // "tamper-evident" implies an alteration would show. Nothing detects one — no hash chain, no
    // signature. Restoring the word needs that mechanism first; see this module's header.
    expect(AUDIT_LOG_BASIS).not.toMatch(/tamper|evident|immutable|unalterable|verified|guarantee/i)
    expect(AUDIT_LOG_BASIS).toContain('append-only')
  })

  it('N3 both verifier surfaces read this module rather than their own wording', () => {
    for (const rel of ['lib/assurancePdf.ts', 'app/verify/[token]/page.tsx']) {
      const src = read(rel)
      expect(src, rel).toContain('auditTrailLine(')
      // Comments may quote the wording that went; code may not. Block comments are stripped whole,
      // because a JSX comment's continuation lines start with neither marker.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, `${rel} must not type the claim out`).not.toMatch(/tamper-evident/i)
    }
  })
})
