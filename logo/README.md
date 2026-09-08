# ThemisIQ logo — handoff

Replaces the gradient wordmark. Same name, same brand teal, no gradient: the Q's
tail is drawn as the leaf, so the mark is one shape rather than a wordmark with a
symbol parked next to it.

## Rulings that settled this package

1. **The logo uses the codebase's teal — `#095C6B`.** `--color-brand` does NOT
   move. No palette migration, no change to `lib/brand.ts`. The logo follows the
   brand, not the reverse. (An earlier draft of this package used `#0D9488`;
   that was read off the old logo artwork, not the token layer. Superseded.)
2. **`lib/pdf/logo.ts` is to be replaced.** Its "DO NOT RECREATE" warning is
   superseded by this redesign. Use `themisiq-logo.png` — a real raster of the
   new artwork with Archivo applied — not a sharp rasterisation of the SVG.
3. **Nav size is matched by cap height, not by the 44px bar height.** See below.

## Files

| File | Use |
| --- | --- |
| `ThemisIQLogo.tsx` | **Preferred for the site.** Full lockup, live text + drawn Q. Typed props: `size`, `reversed`, `mono`. |
| `themisiq-logo.png` | 1692×504 raster of the light lockup, Archivo applied. **For `lib/pdf/logo.ts` and anything jsPDF.** |
| `themisiq-logo-reversed.png` | Same, light-on-ink. |
| `themisiq-logo.svg` | Lockup as SVG. Uses `<text>` — needs Archivo resolvable at render time. Handoff to vendors only; never rasterise it. |
| `themisiq-logo-reversed.svg` | Same, for dark backgrounds. |
| `themisiq-mark.svg` | Q + leaf alone, pure vector. App icon, avatar, PDF cover marks. |
| `themisiq-mark-reversed.svg` | Mark alone, for dark backgrounds. |
| `themisiq-mark-mono.svg` | Mark alone in `currentColor` — one-colour print, embroidery, stamps. |
| `themisiq-favicon.svg` | 64×64 rounded tile, mark on ink. Source for the favicon set. |

## Colour

Two flat steps of the brand teal, split along the leaf's vein. Never a gradient —
that is the specific thing being removed.

| Token | Hex | Where |
| --- | --- | --- |
| Ink | `#111927` | "Themis" on light backgrounds |
| Brand | `#095C6B` | "I", Q ring, lower half of leaf — on light. Matches `--color-brand`. |
| Brand light | `#12849A` | Upper half of the leaf on light. Graphic only — never used for text. |
| Brand on dark | `#2AA5BC` | "I", Q ring, lower leaf — on ink |
| Brand light on dark | `#6FCEDC` | Upper half of the leaf on ink |

`#12849A` and `#2AA5BC` are logo-internal values, not new design tokens. They
exist because a two-tone leaf needs a second step of the same hue; don't add them
to the palette or use them for UI.

## Type

Archivo, weight 700, letter-spacing `-0.035em`. Google Fonts, free to license.
Load it via `next/font/google` in `app/layout.tsx` alongside Geist / Literata /
Atkinson, exposing `--font-archivo` — `ThemisIQLogo.tsx` reads that variable.

## Sizes and clear space

- The component's `size` is a **font-size**, and the lockup's cap height is about
  `0.72 × size`. To match the wordmark that's there today, measure the cap height
  of the old asset and set `size = capHeight / 0.72`. For a 44px nav bar that
  usually lands at **`size={30}`**; do not exceed 32 in a 44px bar.
- Hero: 76. Never below 18 for the full lockup — use `themisiq-mark.svg` alone
  instead.
- Mark alone: 24px minimum on screen, 10mm in print.
- Clear space on all sides equals the cap height of the T. The leaf overhangs the
  wordmark's right edge, so measure from the leaf tip, not from the Q.
- Don't recolour, rotate, outline, or add effects to the mark.

## Known gaps

- **Nothing here is outlined type.** For a printer or a trademark filing the text
  must be converted to paths in a vector editor first.
- **The OG/share image is not in this package** — it needs regenerating as an
  image, not code.
- `themisiq-logo.svg` renders in a fallback font anywhere Archivo isn't loaded
  (email, some PDF pipelines). Use the PNGs for raster, the component for web.
