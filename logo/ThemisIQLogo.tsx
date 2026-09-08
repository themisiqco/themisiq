// ThemisIQ wordmark. Live text + drawn Q, so it inherits font loading and
// scales with font-size. Requires Archivo weight 700 (load via next/font/google
// alongside Geist / Literata / Atkinson).
//
//   <ThemisIQLogo size={30} />            // nav, matched to the old cap height
//   <ThemisIQLogo size={76} />            // hero
//   <ThemisIQLogo size={48} reversed />   // on dark
//   <ThemisIQLogo size={22} mono="#111927" />

const RING =
  "M55 3a52 52 0 1 0 0 104a52 52 0 1 0 0-104zm0 23a29 29 0 1 0 0 58a29 29 0 1 0 0-58z";
const LEAF_HI = "M62 62 C114 66 136 94 128 124 C122 98 106 78 62 62 Z";
const LEAF_LO = "M62 62 C106 78 122 98 128 124 C98 120 78 106 62 62 Z";

export type ThemisIQLogoProps = {
  /** Font size in px. The lockup's cap height is ~0.72x this value. */
  size?: number;
  /** Use the light-on-ink palette. */
  reversed?: boolean;
  /** Force the whole lockup to one colour (print, embroidery, stamps). */
  mono?: string;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "color">;

export default function ThemisIQLogo({
  size = 30,
  reversed = false,
  mono,
  className,
  ...rest
}: ThemisIQLogoProps) {
  const ink = mono ?? (reversed ? "#F5F6F8" : "#111927");
  const ring = mono ?? (reversed ? "#2AA5BC" : "#095C6B");
  const hi = mono ?? (reversed ? "#6FCEDC" : "#12849A");

  return (
    <span
      className={className}
      role="img"
      aria-label="ThemisIQ"
      style={{
        fontFamily: "var(--font-archivo), Helvetica, Arial, sans-serif",
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.035em",
        lineHeight: 1,
        color: ink,
        whiteSpace: "nowrap",
      }}
      {...rest}
    >
      Themis
      <span style={{ color: ring }}>I</span>
      <svg
        viewBox="0 0 140 130"
        height="0.919em"
        fill="none"
        aria-hidden="true"
        style={{ verticalAlign: "-0.163em", overflow: "visible" }}
      >
        <path fillRule="evenodd" clipRule="evenodd" d={RING} fill={ring} />
        <path d={LEAF_HI} fill={hi} />
        <path d={LEAF_LO} fill={ring} />
      </svg>
    </span>
  );
}
