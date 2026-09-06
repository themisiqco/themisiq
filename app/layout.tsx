import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Literata,
  Atkinson_Hyperlegible_Next,
} from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* ⚠️ THE VARIABLE NAMES ARE THE CONTRACT WITH app/styles/themisiq-tokens.css, NOT A CHOICE HERE.
   Its @theme block reads `--font-display: var(--font-literata)` and
   `--font-sans: var(--font-atkinson)`. Rename either string and both fall back to the
   Georgia/system-ui tails in that file — silently, with no build error and no missing-font
   warning, because a var() with an undefined custom property just takes its fallback.
   Both are variable fonts (wght axis; Literata also carries opsz), so no `weight` is passed —
   the whole range is available and the token layer selects from it. */
const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
});

const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ThemisIQ — Countless Compliance Requirements. One Intelligent Platform.",
  description: "ThemisIQ — your sustainability compliance reporting solution.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${literata.variable} ${atkinson.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
