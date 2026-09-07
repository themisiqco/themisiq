import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // ⚠️ THE FIRST REDIRECT IN THIS FILE. /impact-materiality was the Impact Materiality
  // Assessment's own marketing page until 26 Aug 2026, when it merged into /materiality and was
  // deleted. Nav, HomePricing and every external link or bookmark pointing at the old URL would
  // otherwise 404 — Next has no implicit fallback, and this file was the bare scaffold.
  //
  // ⚠️ permanent: true EMITS 308, NOT 301, AND THAT IS NEXT'S DELIBERATE CHOICE, NOT A BUG.
  // Next uses 307/308 rather than 302/301 because many browsers rewrite the request method on a
  // 301 — a POST becomes a GET at the destination — and 308 preserves it. For SEO the two are
  // equivalent: search engines treat 308 as a permanent move and pass ranking through. If a
  // literal 301 is ever required for an older client, the option is `statusCode: 301` INSTEAD OF
  // `permanent` — the two cannot both be set.
  async redirects() {
    return [
      { source: '/impact-materiality', destination: '/materiality', permanent: true },
    ]
  },

  /**
   * ⚠️ SET EXPLICITLY BECAUSE app/security/page.tsx CLAIMS IT.
   * Vercel already served `strict-transport-security: max-age=63072000` as a platform default —
   * verified by curl against www.themisiq.co — so the security page's "HSTS enabled" claim was
   * TRUE but inherited: nothing in this repo set it, recorded it, or would notice if the platform
   * default changed. A claim a customer can read should be evidenced by the thing that produces it.
   *
   * max-age=63072000 is two years, matching what was already being served, so this changes nothing
   * observable today. That is the point — it makes the existing behaviour ours rather than a
   * vendor's, at zero behavioural risk.
   *
   * ⚠️ NO includeSubDomains, DELIBERATELY, AND NOT BECAUSE IT IS WRONG.
   * HSTS is sticky: a browser that sees this header remembers it for the full max-age and there is
   * no way to withdraw it early — removing the header does not clear it. includeSubDomains would
   * therefore force HTTPS on every *.themisiq.co host for two years per visitor, including hosts
   * that do not exist yet. This repo references exactly ONE host, www.themisiq.co (19 occurrences,
   * and the only themisiq host in .env.local) — but the repo cannot enumerate DNS, and the DNS zone
   * is the authority on what subdomains exist. Add it once that zone has been checked.
   *
   * ⚠️ NO preload. It requires includeSubDomains, means submission to a browser-vendor list, and
   * removal from that list takes months. Not a config change — a commitment.
   */
  async headers() {
    return [
      {
        // '/:path*' matches EVERY route — pages, /api handlers, and 404s alike. Next applies these
        // in its own response pipeline before routing resolves, so an unmatched path still carries
        // them. Verified with `curl -sI` against `next start` on a page, an API route and a 404.
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },

          // Stops the browser guessing a response's type from its bytes instead of its
          // Content-Type. RISK IF IT BREAKS SOMETHING: a response served with a wrong or missing
          // Content-Type that only worked because the browser guessed. Nothing here depends on
          // that — Next types its own responses, exports are client-side blob URLs that never
          // traverse this header, and source documents are served from Supabase's origin, not ours.
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // ⚠️ THE ONE THAT EARNS ITS PLACE IN THIS CODEBASE, because six route groups put a SECRET
          // TOKEN IN THE URL PATH: /verify/[token], /verify-cbam/[token], /supplier/[token],
          // /survey/[token], /impact/[token], /deals/[token]. Whatever the browser sends as a
          // Referer from those pages carries the token with it unless a policy stops it.
          // Current browser defaults already send origin-only cross-origin, so the token is
          // probably not leaking today — but that is a DEFAULT, which is the same inherited-and-
          // unrecorded position HSTS was in, on a path where the cost of being wrong is a live
          // verifier or supplier token in a third party's logs.
          // Full URL same-origin, origin only cross-origin, nothing on an HTTPS->HTTP downgrade.
          // RISK: anything consuming a full referrer — analytics attribution, referral tracking,
          // an OAuth flow that inspects Referer. None applies: this project has no analytics SDK
          // of any kind, Stripe Checkout is a top-level window.location.href navigation that does
          // not gate on Referer, and the Supabase auth callback is same-origin.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

          // Clickjacking: stops another site framing our pages. RISK: any legitimate embedding of
          // these pages elsewhere. There is none — no <iframe>, no frameborder and no
          // frame-ancestors anywhere in app/ or lib/; this app neither embeds nor is embedded.
          // Low value for that same reason, and it costs nothing.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ]
  },
};

export default nextConfig;
