import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

/**
 * A serif display face against a neutral sans is what carries the editorial
 * look, and it costs nothing in assets — which matters given the shop has line
 * art rather than product photography.
 */
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RuleShop",
  description:
    "Magazine online în care prețurile, livrarea și aspectul sunt decise de un rule engine configurabil.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ro"
      className={`${display.variable} ${body.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
