// lib/ghg/fileHash.ts
//
// T15 (rule R6, docs/review/design-derived-figures.md): the SHA-256 of an uploaded file, hex-encoded, computed in
// the browser before upload and stored on the source document as `sha256`.
//
// FOR DUPLICATE DETECTION ONLY. The browser supplies it, so it is not an integrity guarantee and nothing may rely
// on it as one. findExactDuplicates (lib/ghg/engine.ts) compares it to spot the same file uploaded as two kinds
// of document.
//
// NEVER BLOCKS AN UPLOAD. Any failure (no Web Crypto, a file that cannot be read) returns null, and the document
// is uploaded without a hash. A missing hash never matches another document.

export async function sha256Hex(file: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
