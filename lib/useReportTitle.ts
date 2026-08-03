// lib/useReportTitle.ts
// ThemisIQ — document titles for the printable report pages.
//
// WHY. A browser's "Save as PDF" (Cmd+P) derives its SUGGESTED FILENAME from document.title. No
// report page set one, so every saved report landed named after the site-wide title in
// app/layout.tsx — three reports for three companies, all called "ThemisIQ — Countless Compliance
// Requirements. One Intelligent Platform.pdf" and indistinguishable in a folder. This gives each
// report a title carrying the company and the artefact.
//
// These pages are 'use client' components, so Next's `metadata` export does not apply — that is a
// server-component API and the seven existing metadata exports are all on marketing pages. Setting
// document.title in an effect is the client-side equivalent. There was no prior pattern for it in
// this codebase; this is it.
//
// SEPARATOR: a plain ASCII hyphen, NOT the em-dash the reports use in prose. An em-dash is a legal
// filename character on macOS, Windows and Linux and does survive the round-trip — but it is
// non-ASCII, so it is mangled by tools that assume ASCII, percent-encoded when the file is later
// shared by URL, and visually confusable with a hyphen in a file listing. The hyphen carries none
// of that and reads identically. Prose keeps the em-dash; filenames do not.
//
// Filename sanitising and date formatting live in lib/filename.ts — they are pure string helpers
// with a consumer (the CSV export) that has nothing to do with titles.

import { useEffect } from 'react'
import { filenameSafe } from './filename'

/** "{Company} - {Artefact}", or just the artefact when no company name is held. */
export const reportTitle = (company: string | null | undefined, artefact: string): string => {
  const name = filenameSafe(company ?? '')
  return name ? `${name} - ${artefact}` : artefact
}

/**
 * Sets document.title while mounted and restores the previous title on unmount, so navigating away
 * from a report does not leave the rest of the site titled after someone's deal.
 *
 * Pass `null` until the data has loaded. A title assembled from an undefined company would flash
 * into the tab, and would be what Cmd+P picked up if the user got there first.
 */
export function useReportTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => { document.title = previous }
  }, [title])
}
