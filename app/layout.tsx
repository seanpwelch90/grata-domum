import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./fonts.css";

export const metadata: Metadata = {
  title: "Grata Domum",
  description: "A private welcome for the people staying in this house.",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Grata Domum",
    statusBarStyle: "default",
  },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1e4638",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
