import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { subjectText } from './emailSubject'
import { stripTsComments } from './testing/stripComments'

const ROOT = join(__dirname, '..')

function apiFiles(dir = 'app/api', out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) apiFiles(rel, out)
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) out.push(rel)
  }
  return out
}

/**
 * Every expression that becomes an email subject: the `subject:` property of a send options object, and
 * the second argument of a local `sendEmail(to, subject, html, …)` helper — the shape all four routes use.
 */
/** The initialiser of `const <name> = …` in this file, if there is one. */
function declarationText(sf: ts.SourceFile, name: string): string | null {
  let found: string | null = null
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
      found = n.initializer.getText()
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

function subjectExpressions(rel: string): { where: string; text: string }[] {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const out: { where: string; text: string }[] = []
  const at = (n: ts.Node) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && n.name.getText() === 'subject') {
      out.push({ where: at(n), text: n.initializer.getText() })
    }
    if (ts.isCallExpression(n) && n.expression.getText() === 'sendEmail' && n.arguments.length >= 2) {
      const arg = n.arguments[1]
      // ⚠️ AN IDENTIFIER IS FOLLOWED TO ITS DECLARATION. Three invite routes build the subject into a
      // `const subject = …` and pass that, so reading only the argument saw a bare name and found no
      // interpolation — the first version of this guard reported two routes out of five.
      const text = ts.isIdentifier(arg) ? (declarationText(sf, arg.text) ?? arg.getText()) : arg.getText()
      out.push({ where: at(arg), text })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

describe('email subject lines', () => {
  it('strips CR and LF, and touches nothing else', () => {
    // ⚠️ THE AMPERSAND IS THE POINT. This is what an HTML escaper broke.
    expect(subjectText('AT&T')).toBe('AT&T')
    expect(subjectText('Smith & Co <smith@example.com>')).toBe('Smith & Co <smith@example.com>')
    expect(subjectText("O'Brien")).toBe("O'Brien")
    // Header injection: a CR or LF would end the Subject header and begin another.
    expect(subjectText('Acme\r\nBcc: someone@example.com')).toBe('Acme Bcc: someone@example.com')
    expect(subjectText('Acme\nLtd'), 'a space, so the words do not run together').toBe('Acme Ltd')
    expect(subjectText('  Acme  Ltd  ')).toBe('Acme Ltd')
    expect(subjectText(null)).toBe('')
    expect(subjectText(undefined)).toBe('')
  })

  it('⚠️ no email subject in app/api passes through an HTML escaper', () => {
    // The defect this test exists for: five subjects in the quote-request route were built from esc()'d
    // text, so "AT&T" was delivered as "AT&amp;T". A subject has no HTML parser at the other end.
    const offenders: string[] = []
    for (const rel of apiFiles()) {
      for (const s of subjectExpressions(rel)) {
        if (/\besc\(|escapeHtml\(|&amp;/.test(s.text)) offenders.push(`${s.where}: ${s.text.slice(0, 80)}`)
      }
    }
    expect(offenders, offenders.length === 0 ? '' :
      'AN EMAIL SUBJECT IS HTML-ESCAPED:\n  ' + offenders.join('\n  ') +
      '\n\nA subject is plain text: the escape becomes the text a person reads. Use subjectText() from ' +
      'lib/emailSubject.ts, which strips CR and LF and nothing else. esc() belongs in the HTML body.')
      .toEqual([])
  })

  it('every subject that interpolates a value goes through subjectText', () => {
    // ⚠️ COARSE BY DESIGN, AND PAIRED WITH THE TEST ABOVE. A subject expression usually interpolates a
    // local that was sanitised where it was declared, so the call is not always inside the template. What
    // is checkable is that a route building a subject from a value knows about the helper at all.
    const offenders: string[] = []
    for (const rel of apiFiles()) {
      const subjects = subjectExpressions(rel)
      if (subjects.length === 0) continue
      const interpolates = subjects.some(s => s.text.includes('${'))
      if (!interpolates) continue
      const src = stripTsComments(readFileSync(join(ROOT, rel), 'utf8'))
      if (!/\bsubjectText\(/.test(src)) offenders.push(`${rel}: builds a subject from a value`)
    }
    expect(offenders, offenders.length === 0 ? '' :
      'A ROUTE INTERPOLATES A VALUE INTO A SUBJECT WITHOUT subjectText:\n  ' + offenders.join('\n  ') +
      '\n\nA CR or LF in that value ends the Subject header and begins another.').toEqual([])
  })
})
