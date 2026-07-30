import type { Metadata } from "next";
import {
  Figtree,
  Fraunces,
  Inter,
  Lora,
  Playfair_Display,
  Space_Grotesk,
  Syne,
} from "next/font/google";
import "./globals.css";

/**
 * Every font a theme may select.
 *
 * Loaded here at build time and exposed as one CSS variable each, so a theme
 * chooses by key and can only reach a face the shop already has. That is why
 * theme tokens can carry a font at all without letting authored data trigger a
 * remote request or inject a family name.
 *
 * Syne and Figtree are also the shop's own defaults, so an unthemed store and the
 * fallback theme look the same rather than subtly different.
 */
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-spaceGrotesk",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const fontVariables = [
  syne.variable,
  fraunces.variable,
  playfair.variable,
  spaceGrotesk.variable,
  figtree.variable,
  inter.variable,
  lora.variable,
].join(" ");

export const metadata: Metadata = {
  title: "RuleShop",
  description:
    "Magazine online în care prețurile, livrarea și aspectul sunt decise de un rule engine configurabil.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro" className={`${fontVariables} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
