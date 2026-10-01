import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripTsComments } from '../../lib/testing/stripComments'

// ⚠️ NO PUBLIC PAGE STATES HOW MANY QUESTIONS /assess ASKS. "Three questions, no account needed." sat on
// the homepage and eight module pages while /assess asked nine; a count written into copy goes stale the
// moment a question is added. The copy says "Free, takes about five minutes." instead, and /assess itself
// derives its count from questions.length. Comments are stripped, so a note recording a past count is fine;
// /dashboard is out of scope, because its wizards ask their own fixed questions.
const REPO_ROOT = join(__dirname, '..', '..')
const COUNT = /\b(three|\d+) questions\b/i

function pages(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) { if (rel !== 'app/dashboard') pages(rel, out) }
    else if (e.name === 'page.tsx') out.push(rel)
  }
  return out
}

describe('no page outside /dashboard states a question count', () => {
  it('finds no "three questions" or "N questions" in rendered source', () => {
    const files = pages('app')
    expect(files.length).toBeGreaterThan(20)
    expect(files).toContain('app/page.tsx')
    const hits = files.flatMap(rel => stripTsComments(readFileSync(join(REPO_ROOT, rel), 'utf8')).split('\n')
      .flatMap((line, i) => (COUNT.test(line) ? [`${rel}:${i + 1}: ${line.trim()}`] : [])))
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('the pattern catches what it is for', () => {
    expect(COUNT.test('Three questions, no account needed.')).toBe(true)
    expect(COUNT.test('Answer 9 questions.')).toBe(true)
    expect(COUNT.test('Free, takes about five minutes.')).toBe(false)
  })
})
