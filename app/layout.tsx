import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Évora Intelligence 1.0",
  description: "Plataforma executiva de inteligência preditiva imobiliária da Évora Urbanismo.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
