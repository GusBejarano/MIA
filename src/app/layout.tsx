import type { Metadata } from "next";
import { Exo_2 } from "next/font/google";
import "./globals.css";

const exo2 = Exo_2({
  variable: "--font-exo2",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "mia — Descuentos Inteligentes",
  description:
    "MIA te muestra los descuentos que de verdad te sirven, sin perder tiempo revisando cientos de promociones.",
  // Nombre corto bajo el icono al "Agregar a inicio" en iOS - sin esto,
  // Safari usa el <title> completo de arriba y lo trunca ("mia — Descu...").
  // No afecta el titulo de la pestana del navegador, solo este caso.
  appleWebApp: {
    title: "MIA",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${exo2.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
