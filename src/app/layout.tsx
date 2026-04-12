import type { Metadata } from "next";

import "@/app/globals.css";

if (typeof window === "undefined") {
  try {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
    });
  } catch {
    // Ignora ambientes onde a redefinição não é permitida.
  }
}

export const metadata: Metadata = {
  title: "NewLoteca Node",
  description: "Conferidor da Mega-Sena com nova interface em Node.js",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
