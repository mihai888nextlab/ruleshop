import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RuleShop",
  description: "Magazine online conduse de un rule engine configurabil",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
