// app/verification-readiness/page.tsx
// Drop-in route → renders at /verification-readiness
// Server Component (no client JS needed — interactivity is CSS + anchor links).

export const metadata = {
  title: "Verification Readiness · ThemisIQ Climate-GHG",
  description:
    "Turn your completed GHG inventory into a verifier-ready evidence package, and give your chosen verifier secure access.",
};

import { GHG_TIERS, ADDONS } from '../../lib/pricing'
import Nav from '../components/Nav'
const css = `
  .vr{
    --ink:#0d0d0d;--body:#555553;--muted:#888784;--wash:#f8f7f5;--hair:#e8e7e4;--white:#ffffff;
    --green:#0F6E56;--green-soft:#E1F5EE;--red:#B91C1C;
    --grad:linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e);
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    --serif:Georgia,"Times New Roman",serif;
    background:var(--white);color:var(--ink);font-family:var(--sans);font-weight:300;font-size:16px;line-height:1.7;-webkit-font-smoothing:antialiased;
  }
  .vr *{box-sizing:border-box;}
  .vr .wrap{max-width:1140px;margin:0 auto;padding:0 2.5rem;}
  .vr h1,.vr h2,.vr h3{font-family:var(--serif);font-weight:400;line-height:1.15;margin:0;color:var(--ink);}
  .vr h1{font-size:clamp(2.6rem,5vw,4rem);}
  .vr h2{font-size:clamp(1.9rem,3.5vw,2.6rem);}
  .vr h3{font-size:1.2rem;}
  .vr p{margin:0 0 1rem;}
  .vr .grad-text{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-style:italic;}
  .vr .eyebrow{font-family:var(--sans);font-weight:600;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);}
  .vr a{color:inherit;}
  @keyframes vrRise{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
  .vr .rise{opacity:0;animation:vrRise .7s cubic-bezier(.2,.7,.3,1) forwards;}
  .vr .d1{animation-delay:.04s;}.vr .d2{animation-delay:.13s;}.vr .d3{animation-delay:.22s;}.vr .d4{animation-delay:.31s;}
  @media (prefers-reduced-motion:reduce){.vr .rise{animation:none;opacity:1;}}
  .vr .bar{background:var(--white);border-bottom:.5px solid var(--hair);position:sticky;top:0;z-index:20;}
  .vr .bar .wrap{display:flex;align-items:center;justify-content:space-between;height:64px;}
  .vr .wordmark{font-weight:600;font-size:20px;letter-spacing:-.01em;color:var(--ink);}
  .vr .wordmark .iq{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-style:normal;}
  .vr .crumbs{font-size:13px;color:var(--muted);font-weight:300;}
  .vr .crumbs b{color:var(--ink);font-weight:500;}
  .vr .btn{display:inline-flex;align-items:center;gap:8px;font-family:var(--sans);font-weight:500;font-size:14px;padding:13px 30px;border-radius:8px;text-decoration:none;border:.5px solid transparent;cursor:pointer;transition:background .15s,border-color .15s,color .15s,opacity .15s;}
  .vr .btn-primary{background:var(--ink);color:#fff;}
  .vr .btn-primary:hover{background:#262625;}
  .vr .btn-ghost{background:transparent;color:var(--ink);border-color:var(--hair);}
  .vr .btn-ghost:hover{background:var(--wash);}
  .vr .btn-grad{background:var(--grad);color:#fff;}
  .vr .btn-grad:hover{opacity:.92;}
  .vr .entry-zone{background:var(--wash);border-bottom:.5px solid var(--hair);padding:1.6rem 0;}
  .vr .entry-tag{display:block;margin-bottom:.7rem;}
  .vr .entry-card{display:flex;align-items:center;gap:1.1rem;background:var(--white);border:.5px solid var(--hair);border-left:2px solid var(--green);border-radius:0 14px 14px 0;padding:1.1rem 1.4rem;}
  .vr .entry-card .tick{flex:none;width:30px;height:30px;border-radius:99px;background:var(--green-soft);display:flex;align-items:center;justify-content:center;}
  .vr .entry-card .body{flex:1;}
  .vr .entry-card .body .t{font-weight:500;color:var(--ink);}
  .vr .entry-card .body .s{font-size:14px;color:var(--body);font-weight:300;}
  .vr .hero{background:var(--white);}
  .vr .hero .wrap{padding:6rem 2.5rem 5.5rem;}
  .vr .hero h1{max-width:18ch;margin-top:1rem;}
  .vr .hero .sub{font-size:17px;color:var(--body);max-width:62ch;margin-top:1.4rem;font-weight:300;}
  .vr .hero .cta{display:flex;gap:.9rem;flex-wrap:wrap;margin-top:2rem;}
  .vr .hero .fine{font-size:13px;color:var(--muted);margin-top:1.4rem;font-weight:300;}
  .vr section{padding:5rem 0;}
  .vr .section-head{max-width:64ch;margin-bottom:2.4rem;}
  .vr .section-head p{color:var(--body);font-size:17px;margin-top:.5rem;}
  .vr .problem{background:var(--wash);border-top:.5px solid var(--hair);border-bottom:.5px solid var(--hair);}
  .vr .three{display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;}
  .vr .col{background:var(--white);border:.5px solid var(--hair);border-radius:14px;padding:1.6rem;}
  .vr .col .step{font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem;}
  .vr .col.us{border:1.5px solid var(--green);}
  .vr .col.us .step{color:var(--green);}
  .vr .col h3{margin-bottom:.2rem;}
  .vr .col p{font-size:14px;color:var(--body);margin:.3rem 0 0;}
  .vr .features{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;}
  .vr .feat{background:var(--white);border:.5px solid var(--hair);border-radius:14px;padding:1.3rem;transition:background .15s;}
  .vr .feat:hover{background:var(--wash);}
  .vr .feat .ic{width:26px;height:26px;color:var(--green);margin-bottom:.7rem;}
  .vr .feat h3{font-family:var(--sans);font-size:15px;font-weight:600;color:var(--ink);margin-bottom:.25rem;line-height:1.3;}
  .vr .feat p{font-size:13px;color:var(--body);margin:0;line-height:1.5;font-weight:300;}
  .vr .how.lead{color:var(--body);max-width:60ch;font-size:17px;margin-top:.5rem;}
  .vr .how-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:3rem;align-items:center;margin-top:2rem;}
  .vr .steps{list-style:none;padding:0;margin:0;}
  .vr .steps li{position:relative;padding:1rem 0 1rem 3.4rem;border-bottom:.5px solid var(--hair);}
  .vr .steps li:last-child{border-bottom:none;}
  .vr .steps li .num{position:absolute;left:0;top:1rem;font-family:var(--serif);font-style:italic;font-size:1.5rem;background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
  .vr .steps li b{font-weight:500;color:var(--ink);}
  .vr .steps li span{display:block;color:var(--body);font-size:14px;font-weight:300;}
  .vr .diagram-card{background:var(--wash);border:.5px solid var(--hair);border-radius:14px;padding:1.4rem;}
  .vr .trust{background:var(--green-soft);border:1px solid rgba(15,110,86,.33);border-radius:16px;padding:2.4rem 2.6rem;display:flex;gap:1.6rem;align-items:flex-start;}
  .vr .trust .seal{flex:none;width:46px;height:46px;color:var(--green);}
  .vr .trust .eyebrow{color:var(--green);}
  .vr .trust h2{margin:.3rem 0 .6rem;}
  .vr .trust p{color:#1c4d40;margin:0;max-width:72ch;font-weight:300;}
  .vr .price-grid{display:grid;grid-template-columns:1fr 1.15fr;gap:1.25rem;align-items:stretch;}
  .vr .price{background:var(--white);border:.5px solid var(--hair);border-radius:14px;padding:1.9rem;display:flex;flex-direction:column;}
  .vr .price.add{border:1.5px solid var(--green);position:relative;}
  .vr .price .tier{font-weight:600;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
  .vr .price.add .tier{color:var(--green);}
  .vr .price .amt{font-family:var(--serif);font-size:2.4rem;margin:.4rem 0 .1rem;line-height:1;color:var(--ink);}
  .vr .price .amt small{font-family:var(--sans);font-size:14px;color:var(--muted);font-weight:300;}
  .vr .price .desc{color:var(--body);font-size:14px;font-weight:300;margin-top:.4rem;}
  .vr .price ul{list-style:none;padding:0;margin:1.1rem 0 1.4rem;flex:1;}
  .vr .price li{display:flex;gap:.6rem;padding:.45rem 0;font-size:14px;color:var(--body);border-bottom:.5px solid var(--hair);font-weight:300;}
  .vr .price li:last-child{border-bottom:none;}
  .vr .price li .c{color:var(--green);flex:none;}
  .vr .ribbon{position:absolute;top:-11px;right:1.4rem;background:var(--grad);color:#fff;font-weight:600;font-size:11px;letter-spacing:.08em;padding:4px 12px;border-radius:99px;text-transform:uppercase;}
  .vr .final{text-align:center;}
  .vr .final .box{background:var(--wash);border:.5px solid var(--hair);border-radius:18px;padding:4rem 2.5rem;}
  .vr .final .cta{display:flex;gap:.9rem;justify-content:center;flex-wrap:wrap;margin-top:1.6rem;}
  .vr .final p{color:var(--body);max-width:56ch;margin:.6rem auto 0;font-weight:300;}
  .vr footer{background:var(--ink);color:#9a9a98;padding:2.6rem 0;font-size:13px;font-weight:300;}
  .vr footer .wrap{display:flex;justify-content:space-between;gap:1.5rem;flex-wrap:wrap;}
  .vr footer .wordmark{color:#fff;}
  .vr footer .tag{color:#76756f;margin-top:.4rem;}
  .vr footer .disc{max-width:66ch;line-height:1.65;}
  @media (max-width:980px){.vr .features{grid-template-columns:repeat(2,1fr);}}
  @media (max-width:860px){
    .vr .three,.vr .addons{grid-template-columns:1fr;}
    .vr .how-grid,.vr .price-grid{grid-template-columns:1fr;}
    .vr .trust{flex-direction:column;gap:1rem;}
    .vr .wrap{padding:0 1.5rem;}
  }
`;

const features = [
  ["M4 4h16v16H4z M4 9h16M9 9v11", "Basis of preparation", "Criteria, boundary, period, GWP basis and materiality — the foundation a verifier tests against."],
  ["M3 6h18M3 12h18M3 18h12", "Boundary decision register", "Every site considered, included or excluded, with a control-based reason for each."],
  ["M5 21V7l7-4 7 4v14 M9 21v-6h6v6", "Management assertion", "The signed responsible-party statement an engagement is built around — enforced before issue."],
  ["M4 19V5M4 19h16 M8 16l3-5 3 3 4-7", "Emission factor register", "Source, vintage, region, type and units for every factor, with vintage-mismatch flags."],
  ["M3 5c0-1.1 4-2 9-2s9 .9 9 2-4 2-9 2-9-.9-9-2z M3 5v14c0 1.1 4 2 9 2s9-.9 9-2V5 M3 12c0 1.1 4 2 9 2s9-.9 9-2", "Activity data & ownership", "Monthly data per source, plus the named owner and reviewer for each stream."],
  ["M5 3h14v18H5z M8 7h8 M8 11h2M11 11h2M14 11h2 M8 15h2M11 15h2M14 15h2", "Calculation workbook", "Per-site, per-source working with the arithmetic shown — independently recalculable."],
  ["M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5", "Reconciliation checks", "Monthly tie-outs, recalculation, completeness and duplicate detection — run automatically."],
  ["M12 3l8 4v5c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V7z M9 12l2 2 4-4", "Evidence register", "Source documents linked to each data point, with SHA-256 hashing and chain of custody."],
  ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8v4l3 2", "Audit trail & lineage", "Append-only record of who entered, reviewed and approved every figure."],
  ["M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11", "Control testing", "Evidence that each control actually operated over the period — not just that it exists."],
  ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3", "Sampling register", "Population counts ready for the verifier to select against — independence preserved."],
  ["M12 9v4M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", "Readiness findings", "Prioritised list of what to fix before fieldwork — generated from the package itself."],
];

function Icon({ d }: { d: string }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : "M" + seg} />
      ))}
    </svg>
  );
}

// ── Wire your CTAs here ───────────────────────────────────────────────
// CONTACT_HREF: where "Talk to our team" goes — a contact page or mailto.
const CONTACT_HREF = "mailto:hello@themisiq.co"; // TODO: replace with your real contact route
// ──────────────────────────────────────────────────────────────────────

export default function VerificationReadinessPage() {
  return (
    <div className="vr">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <Nav />

      <div className="entry-zone">
        <div className="wrap">
          <span className="eyebrow entry-tag">How it appears in your inventory</span>
          <div className="entry-card">
            <span className="tick">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
            <span className="body">
              <span className="t">Your 2024 inventory is complete.</span><br />
              <span className="s">Need third-party verification or assurance?</span>
            </span>
            <a href="#hero" className="btn btn-ghost">Learn more →</a>
          </div>
        </div>
      </div>

      <div className="hero" id="hero">
        <div className="wrap">
          <span className="eyebrow rise d1">Assurance add-on</span>
          <h1 className="rise d1">Need third-party verification or <span className="grad-text">assurance?</span></h1>
          <p className="sub rise d2">Your emissions number is the easy part. Getting it through an ISO 14064-3 / ISAE 3410 engagement is where most teams stall. Verification Readiness turns your completed inventory into a verifier-ready evidence package — and gives the verifier you choose secure access to it.</p>
          <div className="cta rise d3">
            <a href="#pricing" className="btn btn-grad">Add to your plan →</a>
            <a href="#included" className="btn btn-ghost">See what&apos;s inside</a>
          </div>
          <p className="fine rise d4">Built around ISO 14064-3 / ISAE 3410 — you stay in control of your data and your verifier.</p>
        </div>
      </div>

      <section className="problem">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">The gap</span>
            <h2>Most carbon tools stop at the <span className="grad-text">number.</span></h2>
            <p>They calculate your emissions and hand you a report. Then the verifier asks for evidence, boundaries, a management assertion, an audit trail — and the real work starts from scratch, on a deadline.</p>
          </div>
          <div className="three">
            <div className="col"><div className="step">Typical tool</div><h3>Produces a number</h3><p>Scope 1 and 2 totals in a report. Accurate — but unsupported.</p></div>
            <div className="col"><div className="step">Then</div><h3>Hands you an empty folder</h3><p>Evidence, controls and the assertion are left entirely to you.</p></div>
            <div className="col us"><div className="step">With ThemisIQ</div><h3>Delivers a defensible package</h3><p>Governance, controls, traceability and source-linked evidence — assembled as you go.</p></div>
          </div>
        </div>
      </section>

      <section id="included">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">What&apos;s inside the package</span>
            <h2>Everything a verifier asks for, <span className="grad-text">in one place.</span></h2>
            <p>Each section is generated from data you already hold or captured through guided intake — and tied back to the evidence that supports it.</p>
          </div>
          <div className="features">
            {features.map(([d, title, body]) => (
              <div className="feat" key={title}>
                <Icon d={d} />
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three parties, one clean line of <span className="grad-text">independence.</span></h2>
            <p className="how lead">ISO 14064-3 requires that whoever checks your numbers is independent of whoever prepared them. ThemisIQ is the tool you prepare with — built to stop exactly where it should.</p>
          </div>
          <div className="how-grid">
            <ol className="steps">
              <li><span className="num">01</span><b>You prepare, with the platform</b><span>Assemble the package, upload evidence, run the checks.</span></li>
              <li><span className="num">02</span><b>You sign the assertion</b><span>Your management asserts the statement — you stay the responsible party.</span></li>
              <li><span className="num">03</span><b>You choose your verifier and grant access</b><span>Generate a secure link for the accredited verifier you select.</span></li>
              <li><span className="num">04</span><b>They verify, independently</b><span>The verifier tests and issues the opinion. We never cross that line.</span></li>
            </ol>
            <div className="diagram-card">
              <svg width="100%" viewBox="0 0 360 300" role="img" aria-label="ThemisIQ provides the platform; the client prepares and asserts; an independent verifier verifies, separated by an ISO 14064-3 independence boundary.">
                <defs>
                  <marker id="vrarrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M2 1L8 5L2 9" fill="none" stroke="#888784" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                </defs>
                <rect x="60" y="14" width="240" height="50" rx="9" fill="#f1f1f0" stroke="#e8e7e4" strokeWidth={0.5} />
                <text x="180" y="35" textAnchor="middle" fill="#0d0d0d" fontFamily="-apple-system,sans-serif" fontWeight={600} fontSize="14">ThemisIQ</text>
                <text x="180" y="53" textAnchor="middle" fill="#888784" fontFamily="-apple-system,sans-serif" fontSize="12" fontWeight={300}>platform · tooling</text>
                <text x="180" y="80" textAnchor="middle" fill="#a9a8a4" fontFamily="-apple-system,sans-serif" fontSize="10" fontWeight={600} letterSpacing="0.5">ROLE BOUNDARY</text>
                <line x1="180" y1="64" x2="180" y2="88" stroke="#888784" strokeWidth={1.2} markerEnd="url(#vrarrow)" />
                <rect x="50" y="94" width="260" height="62" rx="9" fill="#E1F5EE" stroke="#0F6E56" strokeWidth={0.5} />
                <text x="180" y="118" textAnchor="middle" fill="#0d0d0d" fontFamily="-apple-system,sans-serif" fontWeight={600} fontSize="14">Client · responsible party</text>
                <text x="180" y="137" textAnchor="middle" fill="#1c4d40" fontFamily="-apple-system,sans-serif" fontSize="12" fontWeight={300}>prepares · signs · grants access</text>
                <line x1="55" y1="180" x2="305" y2="180" stroke="#7425e3" strokeWidth={1.4} strokeDasharray="5 4" />
                <text x="180" y="174" textAnchor="middle" fill="#7425e3" fontFamily="-apple-system,sans-serif" fontSize="10" fontWeight={600} letterSpacing="0.4">ISO 14064-3 INDEPENDENCE BOUNDARY</text>
                <line x1="180" y1="156" x2="180" y2="202" stroke="#888784" strokeWidth={1.2} markerEnd="url(#vrarrow)" />
                <rect x="60" y="208" width="240" height="62" rx="9" fill="#fff" stroke="#7425e3" strokeWidth={1} />
                <text x="180" y="232" textAnchor="middle" fill="#0d0d0d" fontFamily="-apple-system,sans-serif" fontWeight={600} fontSize="14">Independent verifier</text>
                <text x="180" y="251" textAnchor="middle" fill="#555553" fontFamily="-apple-system,sans-serif" fontSize="12" fontWeight={300}>accredited · issues opinion</text>
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="trust">
            <svg className="seal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5z" /><path d="M9 12l2 2 4-4" /></svg>
            <div>
              <span className="eyebrow">Independence by design</span>
              <h2>We&apos;re the tool — <span className="grad-text">never the verifier.</span></h2>
              <p>ThemisIQ assembles your package and never authors your assertion or issues an opinion. You choose your own accredited verifier and control their access. That separation isn&apos;t a limitation — it&apos;s the very thing ISO 14064-3 independence requires, built into how the product works.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="problem">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Pricing</span>
            <h2>An add-on to the plan you <span className="grad-text">already have.</span></h2>
            <p>Verification Readiness layers on top of your Climate-GHG inventory. Pay only when you need a package verified.</p>
          </div>
          <div className="price-grid">
            <div className="price">
              <div className="tier">Climate-GHG · Essentials</div>
              <div className="amt"><small>from</small> ${GHG_TIERS.starter.priceUSD?.toLocaleString()} <small>/ reporting year</small></div>
              <p className="desc">Climate-GHG — your Scope 1, 2 &amp; 3 inventory engine.</p>
              <ul>
                <li><span className="c">✓</span> Scope 1, 2 &amp; 3 calculation</li>
                <li><span className="c">✓</span> Emission factors &amp; methodology</li>
                <li><span className="c">✓</span> Standard emissions report</li>
              </ul>
              <a href="/pricing" className="btn btn-ghost" style={{ justifyContent: "center" }}>See GHG plans →</a>
            </div>
            <div className="price add">
              <span className="ribbon">Add-on</span>
              <div className="tier">+ Verification Readiness</div>
              <div className="amt">${ADDONS.verification.price} <small>/ reporting year</small></div>
              <p className="desc">Everything needed to hand a verifier a defensible package — verifier access included.</p>
              <ul>
                <li><span className="c">✓</span> All 12 assurance-package sections</li>
                <li><span className="c">✓</span> Evidence upload, hashing &amp; chain of custody</li>
                <li><span className="c">✓</span> Automated reconciliation &amp; readiness findings</li>
                <li><span className="c">✓</span> Management assertion sign-off workflow</li>
                <li><span className="c">✓</span> Secure verifier access to your account &amp; sampling register</li>
              </ul>
              <a href="/pricing" className="btn btn-primary" style={{ justifyContent: "center" }}>Add to your plan →</a>
            </div>
          </div>
        </div>
      </section>

      <section className="final" id="contact">
        <div className="wrap">
          <div className="box">
            <span className="eyebrow">Ready when you are</span>
            <h2 style={{ marginTop: ".5rem" }}>Make your next inventory <span className="grad-text">verification-ready.</span></h2>
            <p>Turn the number you already have into a package a verifier can test efficiently — and shorten the engagement that follows.</p>
            <div className="cta">
              <a href="/pricing" className="btn btn-grad">Add Verification Readiness →</a>
              <a href={CONTACT_HREF} className="btn btn-ghost">Talk to our team</a>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div>
            <div className="wordmark">Themis<span className="iq">IQ</span></div>
            <div className="tag">Compliance Intelligence for Sustainable Business</div>
          </div>
          <p className="disc">ThemisIQ is a software provider and is not an accredited assurance or verification provider. It does not perform verification, validation, certification, or assurance under ISO 14064, ISAE 3410, ESRS, or any other framework. The Verification Readiness package supports an independent third-party engagement; it does not constitute an assurance opinion.</p>
        </div>
      </footer>
    </div>
  );
}
