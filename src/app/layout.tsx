import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopSmart — Compare with evidence. Cart with consent.",
  description:
    "AI shopping assistant with constraint-first research, evidence-backed comparisons, and an approval-controlled planning cart. Simulated Alexa+-style MCP experience.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Fraunces:opsz,wght@9..144,500;9..144,650;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
