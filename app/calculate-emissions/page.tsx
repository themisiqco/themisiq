// app/calculate-emissions/page.tsx
// =================================================================
// ThemisIQ - "Calculate your GHG emissions" page.
// Integrated page: it renders INSIDE your existing layout, so the
// global <Nav> (top) and global footer (bottom) come from the layout.
// This file intentionally has NO header and NO footer of its own.
//
// CONFIG block below holds every link the page uses. Adjust if any
// route differs in your app.
//
// Styles are injected via a <style> tag and fully scoped under `.tiq`
// (including the CSS variables and box-sizing reset) so nothing leaks
// out to the global chrome.
//
// The SB 253 countdown is computed on the server and the page
// revalidates daily (revalidate = 86400), so the number stays current
// without any client-side JavaScript.
// =================================================================

import type { Metadata } from "next";
import Link from "next/link";

// --- CONFIG ------------------------------------------------------
const CONFIG = {
  // Primary CTA: free, no-account calculator entry.
  TRY_URL: "/dashboard/ghg",
  // "Back to" parent product page (the GHG Emissions overview).
  CLIMATE_GHG_URL: "/climate-ghg",
  // "Get in touch" mailto.
  CONTACT_HREF: "mailto:hello@themisiq.co?subject=ThemisIQ%20%E2%80%94%20get%20in%20touch",
  // "Any other questions" mailto.
  QUESTION_HREF: "mailto:hello@themisiq.co?subject=ThemisIQ%20%E2%80%94%20question",
  ASSESS_URL: "/assess",
  SUPPLY_CHAIN_URL: "/supply-chain",
  METHODOLOGY_URL: "/methodology",
  TRUST_URL: "/trust",
  PRICING_URL: "/pricing",
  // SB 253 first-report deadline (drives the countdown chip).
  DEADLINE_ISO: "2026-11-10T00:00:00",
};

// --- SEO ---------------------------------------------------------
export const metadata: Metadata = {
  title: "Calculate Your GHG Emissions | SB 253, CSRD, IFRS S2 | ThemisIQ",
  description:
    "Asked for your carbon footprint? ThemisIQ calculates Scope 1 & 2 emissions in real time on the GHG Protocol and produces a report ready for SB 253, CSRD (ESRS E1), IFRS S2 and more. From $4,900 USD.",
  alternates: { canonical: "/calculate-emissions" },
  openGraph: {
    title: "Calculate Your GHG Emissions in Real Time | ThemisIQ",
    description:
      "See your Scope 1 & 2 emissions instantly, free. Download a report ready for SB 253, CSRD, IFRS S2 and more. From $4,900 USD.",
    url: "/calculate-emissions",
    type: "website",
  },
};

// Regenerate at most once per day so the SB 253 countdown stays fresh.
export const revalidate = 86400;

// --- FAQ structured data (FAQPage) -------------------------------
// Plain-text answers mirroring the visible FAQ. Keep in sync if the
// visible copy changes.
const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is SB 253, and does it apply to me?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SB 253 (the Climate Corporate Data Accountability Act) requires entities doing business in California with at least $1 billion in annual revenue to disclose Scope 1 and Scope 2 emissions, with the first reports due November 10, 2026 and Scope 3 from 2027. If you are under that threshold it may not apply to you directly, but larger customers and investors who are in scope will often ask you for your emissions to complete their own value-chain reporting.",
      },
    },
    {
      "@type": "Question",
      name: "My customer asked for my footprint, but I'm not regulated. Can I still use ThemisIQ?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. You don't need to be subject to SB 253 to produce a credible emissions figure. ThemisIQ gives you a Scope 1 and 2 number on the same GHG Protocol basis your customer's or investor's reporting references, so what you hand back fits straight into their process.",
      },
    },
    {
      "@type": "Question",
      name: "Scope 1, 2 & 3: what they are and which you need",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Scope 1 is direct emissions from sources you own or control; Scope 2 is indirect emissions from purchased energy; Scope 3 is all other value-chain emissions across 15 categories. SB 253's first reports require only Scope 1 and 2 (due November 10, 2026), with Scope 3 from 2027. CSRD (ESRS E1) and IFRS S2 require material Scope 3 as well.",
      },
    },
    {
      "@type": "Question",
      name: "What data do I need to get started?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your energy and fuel records - typically electricity bills and any natural gas, heating-fuel, or vehicle-fuel statements for your reporting year, entered as annual or monthly totals. If your bills are incomplete, the Concierge add-on can tabulate them for you.",
      },
    },
    {
      "@type": "Question",
      name: "How fast is it, really?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Once your totals are in hand, the calculation is real time - your tCO2e updates as you type and you can finish a report the same day. The 'minutes, not months' comparison is against traditional consulting engagements, which typically run a quarter or more.",
      },
    },
    {
      "@type": "Question",
      name: "How accurate is it? Will it hold up to a verifier?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Every calculation runs on the GHG Protocol Corporate Accounting and Reporting Standard with IPCC AR6 global warming potentials (AR4 for SB 253), country-matched emission factors, and both location-based and market-based Scope 2 accounting. Workings are documented per source and aligned with ISO 14064-3 and ISAE 3410, so figures hold up under limited or reasonable assurance.",
      },
    },
    {
      "@type": "Question",
      name: "One inventory, every framework - and which scopes each needs",
      acceptedAnswer: {
        "@type": "Answer",
        text: "From one inventory, ThemisIQ produces reports for SB 253, CDP, ESRS E1 (CSRD), IFRS S2, the GHG Protocol Corporate Standard, EcoVadis, and GRI 305, plus SBTi for inventory and target tracking. SB 253 and the GHG Protocol Corporate Standard start with Scope 1 and 2; CDP, ESRS E1, IFRS S2, GRI 305, and SBTi involve Scope 3. EcoVadis assesses all three scopes.",
      },
    },
    {
      "@type": "Question",
      name: "What does it cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Calculating and previewing your Scope 1 and 2 emissions is free. The GHG module is $4,900 USD; Concierge from $799; Verification Readiness $1,499; Advisory is custom; Scope 3 (all 15 categories) is included in the GHG module; the Supply Chain module adds primary supplier data collection for Category 1. All prices in USD.",
      },
    },
    {
      "@type": "Question",
      name: "Is this a subscription? Will I be charged again?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. ThemisIQ is a one-time purchase - you select and pay for the modules you need, once, and your credit card will not be charged again. Special pricing is available for multi-module and bundled purchases, and every payment is handled securely by Stripe.",
      },
    },
    {
      "@type": "Question",
      name: "What if the total is more than my company card allows?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "At Stripe checkout, choose 'Invoice me' instead of paying by card. We generate an invoice you can forward to your accounting team for payment. Once that payment is received, we email you to confirm your selected modules are unlocked and ready to go.",
      },
    },
    {
      "@type": "Question",
      name: "Can I try it before I pay?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Calculating your emissions is free with no account required. Payment, securely via Stripe, only happens when you choose to unlock and download the finished report.",
      },
    },
    {
      "@type": "Question",
      name: "Is my data secure?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Your data belongs to you and is never sold, shared, or used to train AI models. It is encrypted in transit (TLS 1.2+) and at rest (AES-256) on SOC 2 Type II infrastructure (Supabase on AWS), with row-level security isolating it from every other customer. Payments run through Stripe (PCI DSS Level 1). We comply with PIPEDA, Quebec Law 25, GDPR and UK GDPR, and CCPA.",
      },
    },
    {
      "@type": "Question",
      name: "Will ThemisIQ work for my business anywhere in the world?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Your inventory is built from physical energy and fuel data, and we automatically apply the correct local emission factors - US EPA, ECCC, DEFRA, and IPCC and EEA factors - with global fallbacks. The same inventory can be reported under SB 253, CSRD (ESRS E1), IFRS S2, CDP, GRI 305, and more.",
      },
    },
    {
      "@type": "Question",
      name: "About ThemisIQ",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ThemisIQ is a Canadian company (ThemisIQ Compliance Inc.) built on the belief that rigorous, audit-ready compliance reporting should be within reach of businesses of every size. It was founded by a former Big 4 and sustainability practitioner who has worked with organizations from the world's largest brand names to the smallest startups.",
      },
    },
    {
      "@type": "Question",
      name: "Any other questions? Let us know.",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We're happy to help. Email us at hello@themisiq.co and we'll get back to you.",
      },
    },
  ],
};

// --- Scoped styles ----------------------------------------------
const STYLES = `
  .tiq{
    --serif: Georgia, 'Times New Roman', serif;
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    --ink:#0d0d0d; --mid:#555553; --light:#888784; --surface:#f8f7f5; --border:#e8e7e4;
    --violet:#7425e3; --sky:#1fb1ff; --lime:#64fe3e;
    --green:#0F6E56; --green-tint:#E1F5EE;
    --grad: linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e);
    font-family:var(--sans); font-weight:300; color:var(--ink);
    background:#fff; line-height:1.6;
    -webkit-font-smoothing:antialiased;
  }
  .tiq *{box-sizing:border-box;}
  .tiq .wrap{max-width:1040px; margin:0 auto; padding:0 24px;}
  .tiq h1,.tiq h2,.tiq h3{font-family:var(--serif); font-weight:400; line-height:1.18; margin:0;}
  .tiq p{margin:0;}
  .tiq a{color:inherit;}

  /* eyebrow */
  .tiq .eyebrow{
    font-size:11px; font-weight:500; letter-spacing:.14em; text-transform:uppercase;
    color:var(--light); margin-bottom:14px;
  }

  /* buttons */
  .tiq .btn{
    display:inline-flex; align-items:center; gap:8px; justify-content:center;
    font-family:var(--sans); font-size:15px; font-weight:400; text-decoration:none;
    padding:13px 22px; border-radius:8px; border:0.5px solid transparent; cursor:pointer;
    transition:transform .15s ease, opacity .15s ease;
  }
  .tiq .btn:hover{transform:translateY(-1px);}
  .tiq .btn-primary{background:var(--ink); color:#fff; border-color:var(--ink);}
  .tiq .btn-ghost{background:#fff; color:var(--ink); border-color:var(--border);}
  .tiq .btn-ghost:hover{border-color:var(--ink);}
  .tiq .btn-light{background:#fff; color:var(--ink); border-color:#fff;}
  .tiq .btn-outline-light{background:transparent; color:#fff; border-color:rgba(255,255,255,.4);}
  .tiq .btn-outline-light:hover{border-color:#fff;}

  /* hero */
  .tiq .hero{padding:40px 0 64px;}
  .tiq .back-link{
    display:flex; align-items:center; gap:7px; width:fit-content;
    font-size:13px; color:var(--light); text-decoration:none;
    margin-bottom:22px; transition:color .15s ease;
  }
  .tiq .back-link:hover{color:var(--ink);}
  .tiq .back-link .arrow{font-size:16px; line-height:1; transition:transform .15s ease;}
  .tiq .back-link:hover .arrow{transform:translateX(-3px);}
  .tiq .deadline-chip{
    display:inline-flex; align-items:center; gap:8px;
    font-size:12px; font-weight:500; letter-spacing:.02em; color:var(--green);
    background:var(--green-tint); border-radius:999px; padding:6px 14px; margin-bottom:24px;
  }
  .tiq .deadline-chip .dot{width:6px; height:6px; border-radius:50%; background:var(--green);}
  .tiq .hero h1{font-size:clamp(34px,5.2vw,56px); letter-spacing:-.01em; max-width:18ch;}
  .tiq .hero .sub{font-size:clamp(17px,2vw,20px); color:var(--mid); margin-top:22px; max-width:56ch;}
  .tiq .hero .cta-row{display:flex; flex-wrap:wrap; gap:12px; margin-top:34px;}
  .tiq .hero .reassure{font-size:13px; color:var(--light); margin-top:18px;}

  /* gradient rule */
  .tiq .grad-rule{height:2px; background:var(--grad); border:0; margin:0;}

  /* trigger band */
  .tiq .triggers{background:var(--surface); padding:60px 0;}
  .tiq .triggers h2{font-size:clamp(24px,3vw,30px); max-width:24ch;}
  .tiq .triggers .lede{font-size:16px; color:var(--mid); margin-top:14px; max-width:60ch;}
  .tiq .trigger-grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(216px,1fr)); gap:16px; margin-top:36px;}
  .tiq .trigger-card{
    background:#fff; border:0.5px solid var(--border); border-radius:14px; padding:24px;
  }
  .tiq .trigger-card .tag{font-size:11px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:var(--violet);}
  .tiq .trigger-card h3{font-size:18px; margin:10px 0 8px;}
  .tiq .trigger-card p{font-size:14px; color:var(--mid);}

  /* section heading */
  .tiq .section{padding:72px 0;}
  .tiq .section h2{font-size:clamp(26px,3.4vw,36px); letter-spacing:-.01em;}
  .tiq .section .section-sub{font-size:16px; color:var(--mid); margin-top:14px; max-width:58ch;}

  /* VERTICAL PROCESS MAP - signature element */
  .tiq .vprocess{max-width:740px; margin-top:44px;}
  .tiq .vstep{
    display:grid; grid-template-columns:56px 1fr; gap:24px;
    padding-bottom:38px; position:relative;
  }
  .tiq .vstep:last-child{padding-bottom:0;}
  .tiq .vstep:not(:last-child)::before{
    content:''; position:absolute; left:27.5px; top:60px; bottom:-4px;
    width:1.5px; background:var(--border); z-index:0;
  }
  .tiq .vnum{
    width:56px; height:56px; border-radius:50%; background:#fff;
    border:0.5px solid var(--border); display:flex; align-items:center; justify-content:center;
    font-family:var(--serif); font-size:1.15rem; color:var(--ink);
    position:relative; z-index:1;
  }
  .tiq .vstep:first-child .vnum{background:var(--ink); color:#fff; border-color:var(--ink);}
  .tiq .vstep:first-child .vnum::after{
    content:''; position:absolute; inset:-4px; border-radius:50%;
    border:1.5px solid rgba(116,37,227,.32);
  }
  .tiq .vstep-body{padding-top:4px;}
  .tiq .vstep-title{font-family:var(--serif); font-size:20px; color:var(--ink); margin-bottom:6px;}
  .tiq .vstep-desc{font-size:15px; color:var(--mid); max-width:54ch;}
  .tiq .vstep-desc strong{font-weight:500; color:var(--ink);}
  .tiq .vstep .hint{
    display:inline-flex; align-items:center; gap:6px; margin-top:12px;
    font-size:12px; color:var(--violet); background:#fff;
    border:0.5px solid var(--border); border-radius:999px; padding:5px 12px;
  }
  .tiq .vstep .hint a{color:inherit; text-decoration:underline; text-underline-offset:2px;}
  .tiq .vstep-desc a{color:var(--violet); text-decoration:underline; text-underline-offset:2px;}
  .tiq .how-cta{display:flex; gap:12px; margin-top:44px; flex-wrap:wrap;}
  /* live-calc mini visual */
  .tiq .calcchips{display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-top:14px;}
  .tiq .chip{
    font-size:12px; color:var(--mid); background:var(--surface);
    border:0.5px solid var(--border); border-radius:8px; padding:7px 12px;
  }
  .tiq .chip b{color:var(--ink); font-weight:500;}
  .tiq .chip-out{background:var(--green-tint); border-color:transparent; color:var(--green);}
  .tiq .chip-out b{color:var(--green);}
  .tiq .arrow{color:var(--light); font-size:14px;}

  /* support tiers */
  .tiq .support{background:var(--surface); padding:72px 0;}
  .tiq .support h2{font-size:clamp(26px,3.4vw,36px);}
  .tiq .tier-grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(216px,1fr)); gap:16px; margin-top:40px;}
  .tiq .tier{
    background:#fff; border:0.5px solid var(--border); border-radius:14px;
    padding:26px; display:flex; flex-direction:column;
  }
  .tiq .tier .tier-name{font-family:var(--serif); font-size:20px; margin-bottom:4px;}
  .tiq .tier .tier-price{font-size:13px; font-weight:500; color:var(--green); margin-bottom:14px;}
  .tiq .tier p{font-size:14px; color:var(--mid); flex:1;}
  .tiq .tier .tier-when{font-size:12px; color:var(--light); margin-top:14px; padding-top:14px; border-top:0.5px solid var(--border);}
  .tiq .support-cta{display:flex; justify-content:center; flex-wrap:wrap; gap:12px; margin-top:40px;}
  .tiq .usd-note{font-size:12px; color:var(--light); margin-top:18px;}

  /* FAQ */
  .tiq .faq{margin-top:40px; border-top:0.5px solid var(--border);}
  .tiq details.qa{border-bottom:0.5px solid var(--border);}
  .tiq details.qa summary{
    list-style:none; cursor:pointer; padding:22px 40px 22px 0; position:relative;
    font-family:var(--serif); font-size:18px; color:var(--ink);
  }
  .tiq details.qa summary::-webkit-details-marker{display:none;}
  .tiq details.qa summary::after{
    content:'+'; position:absolute; right:6px; top:20px; font-family:var(--sans);
    font-size:22px; font-weight:300; color:var(--light); transition:transform .2s ease;
  }
  .tiq details.qa[open] summary::after{content:'\\2013'; transform:translateY(1px);}
  .tiq details.qa .qa-body{padding:0 40px 24px 0; font-size:15px; color:var(--mid); max-width:72ch;}
  .tiq details.qa .qa-body strong{font-weight:500; color:var(--ink);}
  .tiq details.qa .qa-body a{color:var(--violet); text-decoration:underline; text-underline-offset:2px;}
  .tiq details.qa .qa-body a:hover{color:var(--ink);}
  .tiq .qa-body p{margin:12px 0 0;}
  .tiq .qa-body .qa-subhead{font-family:var(--serif); font-size:16px; color:var(--ink); margin:18px 0 2px;}
  .tiq .qa-body ul.price-list{list-style:none; padding:0; margin:14px 0 0;}
  .tiq .qa-body ul.price-list li{display:flex; justify-content:space-between; align-items:baseline; gap:16px; padding:11px 0; border-top:0.5px solid var(--border);}
  .tiq .qa-body ul.price-list li:first-child{border-top:0;}
  .tiq .qa-body ul.price-list .pl-name{color:var(--ink); font-size:14px;}
  .tiq .qa-body ul.price-list .pl-price{color:var(--green); font-weight:500; white-space:nowrap; font-size:14px;}
  .tiq .qa-body ul.price-list .pl-price a{color:inherit; text-decoration:underline; text-underline-offset:2px;}
  .tiq .qa-body ul.scope-list{list-style:none; padding:0; margin:12px 0 0;}
  .tiq .qa-body ul.scope-list li{font-size:15px; color:var(--mid); padding:9px 0; border-top:0.5px solid var(--border); line-height:1.55;}
  .tiq .qa-body ul.scope-list li:first-child{border-top:0;}
  .tiq .qa-body ul.scope-list strong{color:var(--ink); font-weight:500;}

  /* dark CTA */
  .tiq .cta-dark{background:var(--ink); border-radius:16px; padding:56px 40px; text-align:center; color:#fff; position:relative; overflow:hidden;}
  .tiq .cta-dark::before{content:''; position:absolute; left:0; right:0; top:0; height:2px; background:var(--grad);}
  .tiq .cta-dark h2{font-size:clamp(26px,3.6vw,38px); color:#fff; max-width:20ch; margin:0 auto;}
  .tiq .cta-dark p{font-size:15px; color:rgba(255,255,255,.7); margin:16px auto 0; max-width:48ch;}
  .tiq .cta-dark .cta-row{display:flex; flex-wrap:wrap; gap:12px; justify-content:center; margin-top:30px;}
  .tiq .cta-section{padding:0 0 80px;}

  /* responsive */
  @media (max-width:820px){
    .tiq .trigger-grid,.tiq .tier-grid{grid-template-columns:1fr;}
    .tiq .hero{padding:28px 0 48px;}
    .tiq .section,.tiq .support,.tiq .triggers{padding:52px 0;}
  }
  @media (prefers-reduced-motion: reduce){
    .tiq .btn:hover{transform:none;}
    .tiq details.qa summary::after{transition:none;}
  }
  .tiq :focus-visible{outline:2px solid var(--violet); outline-offset:3px; border-radius:4px;}

  /* hero footnote */
  .tiq .hero-foot{font-size:12px; color:var(--light); margin-top:14px; max-width:66ch; line-height:1.5;}
  /* framework chips */
  .tiq .fwk-chips{display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 4px;}
  .tiq .fwk{font-size:12px; color:var(--mid); background:#fff; border:0.5px solid var(--border); border-radius:999px; padding:5px 12px;}
`;

export default function CalculateEmissionsPage() {
  // Server-computed SB 253 countdown (page revalidates daily).
  const deadline = new Date(CONFIG.DEADLINE_ISO);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
  const chipText =
    daysLeft > 0
      ? `${daysLeft} days to the SB 253 reporting deadline (Nov 10, 2026)`
      : "SB 253 reporting is now due (Nov 10, 2026)";
  const ctaText =
    daysLeft > 0
      ? `Only ${daysLeft} days until the SB 253 deadline. See your Scope 1 & 2 emissions in minutes and download a report you can submit or share today.`
      : "See your Scope 1 & 2 emissions in minutes \u2014 and download a report you can submit or share today.";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }}
      />

      <div className="tiq">
        {/* HERO */}
        <section className="hero">
          <div className="wrap">
            <Link className="back-link" href={CONFIG.CLIMATE_GHG_URL}>
              <span className="arrow">&larr;</span> Back to GHG Emissions
            </Link>
            <span className="deadline-chip">
              <span className="dot" />
              <span>{chipText}</span>
            </span>
            <h1>You&rsquo;re being asked for your carbon footprint. Have the number this week.</h1>
            <p className="sub">
              ThemisIQ turns your utility and fuel bills into a defensible Scope 1 &amp; 2 figure &mdash; built on the GHG Protocol,
              calculated in real time, at a fraction of the cost of traditional carbon accounting platforms and consultants.
            </p>
            <div className="cta-row">
              <Link className="btn btn-primary" href={CONFIG.TRY_URL}>See your emissions instantly</Link>
              <a className="btn btn-ghost" href={CONFIG.CONTACT_HREF}>Get in touch</a>
            </div>
            <p className="reassure">Explore the calculator free* &mdash; you only pay when you&rsquo;re ready to download your report.</p>
            <p className="hero-foot">*GHG emissions calculated from your totals via our platform, instantly and at no cost. For $4,900 USD, unlock platform access to download your report under any GHG framework you need &mdash; SB&nbsp;253, CSRD&nbsp;(ESRS&nbsp;E1), IFRS&nbsp;S2, and more.</p>
          </div>
        </section>

        <hr className="grad-rule" />

        {/* TRIGGER BAND */}
        <section className="triggers">
          <div className="wrap">
            <div className="eyebrow">Why you&rsquo;re here</div>
            <h2>These days, everyone wants your emissions data.</h2>
            <p className="lede">
              The request to measure your carbon footprint is landing on businesses of every size &mdash; and from every direction.
              A major customer needs your numbers for their own reporting; a regulator now requires it; an investor is footprinting
              their portfolio; your board wants to get ahead of it. Whatever the reason, the request lands on you &mdash; and ThemisIQ
              gets you a credible answer fast, in the format the asker expects.
            </p>
            <div className="trigger-grid">
              <div className="trigger-card">
                <div className="tag">Customer</div>
                <h3>A buyer asked for your numbers</h3>
                <p>Their procurement or sustainability team needs your Scope 1 &amp; 2 emissions to complete their own reporting. Don&rsquo;t let a spreadsheet hold up the contract.</p>
              </div>
              <div className="trigger-card">
                <div className="tag">Government regulation</div>
                <h3>Regulators now require it</h3>
                <p>In the US, California&rsquo;s SB 253 is law today &mdash; Scope 1 &amp; 2 due Nov&nbsp;10,&nbsp;2026 &mdash; with New&nbsp;York, Illinois, New&nbsp;Jersey, and Washington advancing similar bills. Internationally, the EU&rsquo;s CSRD requires it through the ESRS standards, and IFRS&nbsp;S2 is being adopted by regulators in markets worldwide.</p>
              </div>
              <div className="trigger-card">
                <div className="tag">Investor</div>
                <h3>Your investors are footprinting</h3>
                <p>LPs and acquirers are measuring portfolio emissions. Your figure becomes part of theirs &mdash; give them a GHG-Protocol number they can rely on.</p>
              </div>
              <div className="trigger-card">
                <div className="tag">Your board</div>
                <h3>Leadership wants the number</h3>
                <p>Boards are putting climate on the risk agenda and asking for the company&rsquo;s footprint &mdash; to get ahead of disclosure duties and answer stakeholders with confidence.</p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS - vertical process map */}
        <section className="section">
          <div className="wrap">
            <div className="eyebrow">How it works</div>
            <h2>From bills to a submittable report &mdash; in five steps.</h2>
            <p className="section-sub">Start calculating in seconds. No account needed to see your emissions; you only create one when you&rsquo;re ready to download.</p>

            <div className="vprocess">
              <div className="vstep">
                <div className="vnum">01</div>
                <div className="vstep-body">
                  <div className="vstep-title">See your emissions instantly</div>
                  <p className="vstep-desc">Click <strong>&ldquo;See your emissions instantly&rdquo;</strong> to open the calculator. Nothing to install, no sales call to sit through &mdash; just start.</p>
                </div>
              </div>

              <div className="vstep">
                <div className="vnum">02</div>
                <div className="vstep-body">
                  <div className="vstep-title">Select your framework</div>
                  <p className="vstep-desc">We default to <strong>SB 253</strong>, but your inventory can be reported under whichever framework your customer, investor, or regulator expects &mdash; collect once, comply everywhere. Not sure which applies? Run a <strong><Link href={CONFIG.ASSESS_URL}>Free Assessment</Link></strong> and we&rsquo;ll point you to the right one.</p>
                  <div className="fwk-chips">
                    <span className="fwk">California SB 253</span>
                    <span className="fwk">CSRD (ESRS E1)</span>
                    <span className="fwk">IFRS S2</span>
                    <span className="fwk">CDP</span>
                    <span className="fwk">GRI 305</span>
                    <span className="fwk">EcoVadis</span>
                  </div>
                  <span className="hint">$4,900 USD unlocks platform access &mdash; download your report under any framework you need</span>
                </div>
              </div>

              <div className="vstep">
                <div className="vnum">03</div>
                <div className="vstep-body">
                  <div className="vstep-title">Add your company details</div>
                  <p className="vstep-desc">Tell us your <strong>reporting year</strong>, <strong>annual revenue</strong>, and the <strong>number and geography of your locations</strong>. Geography matters &mdash; we apply the correct regional emission factors automatically.</p>
                </div>
              </div>

              <div className="vstep">
                <div className="vnum">04</div>
                <div className="vstep-body">
                  <div className="vstep-title">Enter your energy &amp; fuel data</div>
                  <p className="vstep-desc">Have your monthly or annual <strong>invoices and statements</strong>? Add up the totals and enter them in the right fields. Your <strong>metric tons of CO&#8322;e for Scope 1 and Scope 2</strong> calculate in real time as you type. Missing any documents, or would rather have us calculate the totals? Our <a href="#support">Concierge service</a> is here for you &mdash; see below.</p>
                  <div className="calcchips">
                    <span className="chip">Electricity <b>1,200,000 kWh</b></span>
                    <span className="chip">Natural gas <b>8,500 therms</b></span>
                    <span className="arrow">&rarr;</span>
                    <span className="chip chip-out">Scope 1 + 2 <b>~535 tCO&#8322;e</b></span>
                  </div>
                  <span className="hint">Illustrative only &mdash; your figures depend on your data and location factors</span>
                </div>
              </div>

              <div className="vstep">
                <div className="vnum">05</div>
                <div className="vstep-body">
                  <div className="vstep-title">Unlock &amp; download your report</div>
                  <p className="vstep-desc">Our Scope 1 &amp; Scope 2 GHG module is priced at <strong>$4,900 USD</strong> &mdash; simply create an account and pay securely by credit card, or on invoice, via <strong>Stripe</strong>. Then download your selected report, ready to <strong>submit for California&rsquo;s SB 253, or any other global GHG reporting framework</strong>, or hand straight to your customer or investor.</p>
                  <span className="hint">Scope 3 is included in the GHG module. <Link href={CONFIG.SUPPLY_CHAIN_URL}>Add Supply Chain for primary supplier data on Category 1 &rarr;</Link></span>
                </div>
              </div>
            </div>

            <div className="how-cta">
              <Link className="btn btn-primary" href={CONFIG.TRY_URL}>See your emissions instantly</Link>
              <a className="btn btn-ghost" href={CONFIG.CONTACT_HREF}>Get in touch</a>
            </div>
          </div>
        </section>

        {/* SUPPORT TIERS */}
        <section className="support" id="support">
          <div className="wrap">
            <div className="eyebrow">Choose your level of support</div>
            <h2>However much help you need &mdash; we&rsquo;ve got you covered.</h2>
            <p className="section-sub">Start self-serve and add support only where you want it. Everything runs on the same GHG-Protocol methodology underneath.</p>

            <div className="tier-grid">
              <div className="tier">
                <div className="tier-name">GHG Module</div>
                <div className="tier-price">$4,900*</div>
                <p>The core, self-serve product. Calculate your Scope 1 &amp; 2 emissions and download a report ready for SB 253 &mdash; or any global GHG framework &mdash; built on the GHG Protocol and methodology that holds up to a verifier.</p>
                <div className="tier-when">Start here &mdash; the core Scope 1 &amp; 2 report. Everything else is an optional add-on.</div>
              </div>
              <div className="tier">
                <div className="tier-name">Concierge</div>
                <div className="tier-price">from $799</div>
                <p>Missing invoices, or not comfortable tabulating the annual totals? Our Concierge add-on does the heavy lifting &mdash; we extract and total the data from your statements for you.</p>
                <div className="tier-when">Best when your bills are scattered or you&rsquo;d rather not key in numbers.</div>
              </div>
              <div className="tier">
                <div className="tier-name">Verification Readiness</div>
                <div className="tier-price">$1,499</div>
                <p>Need your GHG emissions verified by a third party? Verification Readiness opens full audit-trail access with a unique verifier log-in to the back end, so they can validate your numbers against our GHG-Protocol methodology &mdash; the gold standard for emissions accounting.</p>
                <div className="tier-when">Best when a customer, investor, or regulator requires independent verification.</div>
              </div>
              <div className="tier">
                <div className="tier-name">Advisory</div>
                <div className="tier-price">Custom</div>
                <p>Want a bit more support? Advisory pairs you with dedicated specialists who walk you through the whole process &mdash; from data collection to a report you can stand behind.</p>
                <div className="tier-when">Best when it&rsquo;s your first inventory or the stakes are high.</div>
              </div>
            </div>

            <p className="usd-note">* All prices shown in USD.</p>

            <div className="support-cta">
              <Link className="btn btn-primary" href={CONFIG.TRY_URL}>Ready to start? See your emissions instantly</Link>
              <a className="btn btn-ghost" href={CONFIG.CONTACT_HREF}>Get in touch</a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section">
          <div className="wrap">
            <div className="eyebrow">Questions</div>
            <h2>Everything you&rsquo;re wondering, answered.</h2>

            <div className="faq">
              <details className="qa">
                <summary>What is SB 253, and does it apply to me?</summary>
                <div className="qa-body">
                  SB 253 (the Climate Corporate Data Accountability Act) requires entities that do business in California with at least <strong>$1 billion in annual revenue</strong> to disclose their Scope 1 and Scope 2 greenhouse-gas emissions, with the first reports due <strong>November 10, 2026</strong>. Scope 3 reporting follows in 2027. If you&rsquo;re under that threshold, SB 253 may not apply to you directly &mdash; but your larger customers and investors who <em>are</em> in scope will often ask you for your emissions so they can complete their own value-chain reporting.
                </div>
              </details>

              <details className="qa">
                <summary>My customer asked for my footprint, but I&rsquo;m not regulated. Can I still use ThemisIQ?</summary>
                <div className="qa-body">
                  Yes &mdash; that&rsquo;s exactly who this is built for. You don&rsquo;t need to be subject to SB 253 to produce a credible emissions figure. ThemisIQ gives you a Scope 1 &amp; 2 number on the same GHG-Protocol basis your customer&rsquo;s or investor&rsquo;s reporting references, so what you hand back fits straight into their process.
                </div>
              </details>

              <details className="qa">
                <summary>Scope 1, 2 &amp; 3: what they are and which you need</summary>
                <div className="qa-body">
                  It depends on who&rsquo;s asking and under which framework. First, the three scopes:
                  <ul className="scope-list">
                    <li><strong>Scope 1</strong> &mdash; direct emissions from sources you own or control, like on-site fuel combustion and company vehicles.</li>
                    <li><strong>Scope 2</strong> &mdash; indirect emissions from the energy you buy: electricity, heat, and steam.</li>
                    <li><strong>Scope 3</strong> &mdash; all other indirect emissions across your value chain, organized into 15 categories: purchased goods and services, business travel, transportation, use of sold products, financed emissions, and more.</li>
                  </ul>
                  <p className="qa-subhead">Which scopes apply to you?</p>
                  <p><strong>Scope 1 &amp; 2 only, for now:</strong> California&rsquo;s SB 253 requires just Scope 1 and Scope 2 for its first reports, due November 10, 2026.</p>
                  <p><strong>Scope 3 required:</strong> SB 253 adds Scope 3 from 2027 (covering fiscal-year 2026 data), with CARB still finalizing the details. The EU&rsquo;s CSRD (ESRS&nbsp;E1) requires your material Scope 3 categories, and IFRS&nbsp;S2 requires Scope 3 as well &mdash; with first-year transition relief in many adopting jurisdictions.</p>
                  <p>If you need it, we&rsquo;ve got it. ThemisIQ covers the full <strong>GHG Protocol Scope 3 Value Chain standard</strong> across all 15 categories &mdash; including PCAF-based financed emissions &mdash; with supplier data collected directly through our portal. <Link href={CONFIG.SUPPLY_CHAIN_URL}>See the Supply Chain module for primary supplier data &rarr;</Link></p>
                </div>
              </details>

              <details className="qa">
                <summary>What data do I need to get started?</summary>
                <div className="qa-body">
                  Your <strong>energy and fuel records</strong> &mdash; typically electricity bills and any natural gas, heating-fuel, or vehicle-fuel statements for your reporting year. You can enter annual or monthly totals. If your bills are incomplete or you&rsquo;d rather not add them up yourself, the <strong>Concierge</strong> add-on handles it for you.
                </div>
              </details>

              <details className="qa">
                <summary>How fast is it, really?</summary>
                <div className="qa-body">
                  Once your totals are in hand, the calculation is <strong>real-time</strong> &mdash; you watch your tCO&#8322;e update as you type, and you can have a finished report the same afternoon. The &ldquo;minutes, not months&rdquo; comparison is against traditional consulting engagements, which typically run a quarter or more.
                </div>
              </details>

              <details className="qa">
                <summary>How accurate is it? Will it hold up to a verifier?</summary>
                <div className="qa-body">
                  Every calculation runs on the <strong>GHG Protocol Corporate Accounting and Reporting Standard</strong> &mdash; the basis required by SB&nbsp;253, CDP, ESRS&nbsp;E1, GRI&nbsp;305, and IFRS&nbsp;S2. We apply IPCC&nbsp;AR6 global warming potentials by default (AR4 for SB&nbsp;253, to match CARB&rsquo;s program) and country-matched emission factors &mdash; US&nbsp;EPA, Canada&rsquo;s ECCC, UK&nbsp;DEFRA, and IPCC and EEA factors for the EU &mdash; all versioned, vintage-stamped, and cited in every export. Scope&nbsp;2 supports both location-based and market-based (residual-mix) accounting per the GHG Protocol Scope&nbsp;2 Guidance, and workings are documented per source and aligned with ISO&nbsp;14064-3 and ISAE&nbsp;3410, so your numbers hold up under limited or reasonable assurance. For requests that require independent sign-off, the <strong>Verification Readiness</strong> add-on gives a third-party verifier their own log-in and a full audit trail. Full detail is on our <Link href={CONFIG.METHODOLOGY_URL}>methodology page</Link>.
                </div>
              </details>

              <details className="qa">
                <summary>One inventory, every framework &mdash; and which scopes each needs</summary>
                <div className="qa-body">
                  Build your inventory once, and ThemisIQ produces the report for whichever framework you&rsquo;re asked for &mdash; with full coverage for SB&nbsp;253, CDP, ESRS&nbsp;E1 (under the EU&rsquo;s CSRD), IFRS&nbsp;S2, the GHG Protocol Corporate Standard, EcoVadis, and GRI&nbsp;305, plus SBTi for inventory and target tracking. What each one asks for differs:
                  <p className="qa-subhead">Frameworks that start with Scope 1 &amp; 2</p>
                  <ul className="scope-list">
                    <li><strong>SB 253</strong> &mdash; Scope 1 &amp; 2 for the first reports (due Nov&nbsp;10,&nbsp;2026); Scope 3 phases in from 2027.</li>
                    <li><strong>GHG Protocol Corporate Standard</strong> &mdash; Scope 1 &amp; 2 required; Scope 3 is reported under the separate Corporate Value Chain (Scope 3) Standard.</li>
                  </ul>
                  <p className="qa-subhead">Frameworks that require Scope 1, 2 &amp; 3</p>
                  <ul className="scope-list">
                    <li><strong>ESRS E1 (CSRD)</strong> &mdash; gross Scope 1 and 2, plus your material Scope 3 categories.</li>
                    <li><strong>IFRS S2</strong> &mdash; Scope 1, 2 and 3, with first-year transition relief to defer Scope 3 by a year in many jurisdictions.</li>
                    <li><strong>CDP</strong> &mdash; Scope 1, 2 and 3, with Scope 3 increasingly expected and scored.</li>
                    <li><strong>GRI 305</strong> &mdash; Scope 1 (305-1), Scope 2 (305-2) and Scope 3 (305-3).</li>
                    <li><strong>SBTi</strong> &mdash; a Scope 3 target is required where Scope 3 is a significant share of your total (over 40% under current criteria).</li>
                  </ul>
                  <p><strong>EcoVadis</strong> rates you across all three scopes &mdash; reporting Scope 3 strengthens your score rather than being a hard requirement.</p>
                  <p>Scope 3 is part of the GHG module &mdash; the full GHG Protocol Value Chain standard across all 15 categories. The <Link href={CONFIG.SUPPLY_CHAIN_URL}>Supply Chain module</Link> adds primary supplier data collection for Category 1. Because these frameworks&rsquo; thresholds and timelines shift often, we keep the mappings current and stamp the exact basis used on every export.</p>
                </div>
              </details>

              <details className="qa">
                <summary>What does it cost?</summary>
                <div className="qa-body">
                  A fraction of what consultants and legacy platforms charge. Seeing your emissions is free &mdash; you only pay when you&rsquo;re ready to download a report or add support:
                  <ul className="price-list">
                    <li><span className="pl-name">Calculate &amp; preview your Scope 1 &amp; 2 emissions</span><span className="pl-price">Free</span></li>
                    <li><span className="pl-name">GHG module &mdash; Scope 1 &amp; 2 report, any framework</span><span className="pl-price">$4,900*</span></li>
                    <li><span className="pl-name">Concierge &mdash; we tabulate the data from your bills</span><span className="pl-price">from $799</span></li>
                    <li><span className="pl-name">Verification Readiness &mdash; third-party verifier access</span><span className="pl-price">$1,499</span></li>
                    <li><span className="pl-name">Advisory &mdash; dedicated specialists guide you</span><span className="pl-price">Custom</span></li>
                    <li><span className="pl-name">Scope 3 &mdash; full value chain, included in the GHG module</span><span className="pl-price"><Link href={CONFIG.CLIMATE_GHG_URL}>See module &rarr;</Link></span></li>
                  </ul>
                  <p className="usd-note">* All prices shown in USD.</p>
                </div>
              </details>

              <details className="qa">
                <summary>Is this a subscription? Will I be charged again?</summary>
                <div className="qa-body">
                  No &mdash; this is not a subscription, and your credit card will not be charged again. ThemisIQ is a one-time purchase: you select and pay for the modules you need, once. Buying more than one module? Ask about our <Link href={CONFIG.PRICING_URL}>special pricing for multi-module and bundled purchases</Link>. We always show you exactly what you&rsquo;re paying for before you confirm, and every payment is handled securely by <strong>Stripe</strong>.
                </div>
              </details>

              <details className="qa">
                <summary>What if the total is more than my company card allows?</summary>
                <div className="qa-body">
                  No problem &mdash; at Stripe checkout, just choose <strong>&ldquo;Invoice me&rdquo;</strong> instead of paying by card. We&rsquo;ll generate an invoice you can forward to your accounting team for payment. Once that payment is received, we&rsquo;ll email you to confirm your selected modules are unlocked and ready to go.
                </div>
              </details>

              <details className="qa">
                <summary>Can I try it before I pay?</summary>
                <div className="qa-body">
                  Yes. Calculating your emissions is free &mdash; no account required. Payment (securely via <strong>Stripe</strong>) only happens when you choose to unlock and download the finished report.
                </div>
              </details>

              <details className="qa">
                <summary>Is my data secure?</summary>
                <div className="qa-body">
                  Security is foundational here. Your data belongs to you &mdash; we never sell or share it, and it is <strong>never used to train AI models</strong>. Everything is encrypted in transit (TLS&nbsp;1.2+) and at rest (AES-256), hosted on SOC&nbsp;2 Type&nbsp;II infrastructure (Supabase on AWS), with row-level security that isolates your data from every other customer at the database level. Payments run through <strong>Stripe</strong> (PCI&nbsp;DSS Level&nbsp;1), so we never see your card details. You can export or delete your data at any time, and we comply with PIPEDA, Quebec Law&nbsp;25, GDPR and UK&nbsp;GDPR, and CCPA. Full detail is on our <Link href={CONFIG.TRUST_URL}>trust &amp; data page</Link>.
                </div>
              </details>

              <details className="qa">
                <summary>Will ThemisIQ work for my business anywhere in the world?</summary>
                <div className="qa-body">
                  Yes &mdash; wherever in the world your business operates, ThemisIQ works for you. Your inventory is built from physical energy and fuel data (kilowatt-hours, therms, cubic metres, Mcf, litres), and we automatically apply the correct <strong>local emission factors</strong> &mdash; US&nbsp;EPA in the United States, ECCC in Canada, DEFRA in the UK, and IPCC and EEA factors across the EU, with global fallbacks for everywhere else. The same inventory can then be reported against whichever framework an international customer, investor, or regulator asks for &mdash; SB&nbsp;253, CSRD&nbsp;(ESRS&nbsp;E1), IFRS&nbsp;S2, CDP, GRI&nbsp;305, and more. Collect once, comply everywhere.
                </div>
              </details>

              <details className="qa">
                <summary>About ThemisIQ</summary>
                <div className="qa-body">
                  ThemisIQ is a Canadian company &mdash; ThemisIQ Compliance Inc. &mdash; built on the belief that rigorous, audit-ready compliance reporting should be within reach of businesses of every size. It was founded by a former Big 4 and sustainability practitioner who has worked with organizations across the spectrum &mdash; from the world&rsquo;s largest brand names to the smallest startups. That range is the whole idea: the same methodology the giants rely on, priced and packaged so any business can pick it up. We implement recognized international standards correctly and keep them current, guided by a single principle &mdash; accuracy forms trust.
                </div>
              </details>

              <details className="qa">
                <summary>Any other questions? Let us know.</summary>
                <div className="qa-body">
                  We&rsquo;re happy to help. Email us at <a href={CONFIG.QUESTION_HREF}>hello@themisiq.co</a> and we&rsquo;ll get back to you.
                </div>
              </details>
            </div>
          </div>
        </section>

        {/* DARK CTA */}
        <section className="cta-section">
          <div className="wrap">
            <div className="cta-dark">
              <h2>Your customer is waiting. The deadline isn&rsquo;t moving.</h2>
              <p>{ctaText}</p>
              <div className="cta-row">
                <Link className="btn btn-light" href={CONFIG.TRY_URL}>See your emissions instantly</Link>
                <a className="btn btn-outline-light" href={CONFIG.CONTACT_HREF}>Get in touch</a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
