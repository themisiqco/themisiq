// lib/filename.ts
// ThemisIQ — helpers for strings that become FILENAMES.
//
// Pure string functions: no React, no module-specific knowledge. They began inside
// lib/useReportTitle.ts, which was an acceptable address while the only consumer was a document
// title. With a second consumer that has nothing to do with titles or hooks — the deals CSV
// download — a `use*` module was the wrong home, so they live here.
//
// Consumers: lib/useReportTitle.ts            (report titles → the Cmd+P PDF filename)
//            app/dashboard/deals/report/*     (dated report title)
//            app/dashboard/deals/page.tsx     (CSV download filename)

/**
 * Strips what a filename cannot safely carry.
 *
 * A company name is free text and can contain a path separator ("Smith / Jones Holdings").
 * Browsers do replace those — but WHICH character each substitutes is browser-specific, so one
 * company would save under different filenames depending on who opened it. Normalise here instead:
 * path separators and the macOS-hostile colon become a hyphen, whitespace runs collapse.
 */
export const filenameSafe = (s: string): string =>
  s.replace(/[/\\:]+/g, '-').replace(/\s+/g, ' ').trim()

/**
 * YYYY-MM-DD in the reader's OWN timezone, for a filename that has to agree with a date printed
 * in the document beside it.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which is UTC. That was a live defect in the deals
 * CSV: a file exported at 23:00 on the 2nd in Toronto was NAMED "2026-08-03" while its own
 * "Generated" row said the 2nd. The whole point of dating a filename is that it matches the
 * document, so the date is built from local components — the same ones `toLocaleDateString`
 * renders from.
 *
 * Pair it with a SINGLE `Date` shared by both the filename and whatever the document prints. Two
 * `new Date()` calls are two instants, and around midnight they are two different days.
 */
export const filenameDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
