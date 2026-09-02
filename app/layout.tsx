import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MALHA by Évora",
  description: "Território, oportunidades e capital conectados em uma plataforma de desenvolvimento urbano.",
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
