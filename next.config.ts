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
};

export default nextConfig;
