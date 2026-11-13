import type { Metadata, Viewport } from "next";
import "./globals.scss";
import { Rethink_Sans } from "next/font/google";

const rethinkSans = Rethink_Sans({
  subsets: ["latin"],
  variable: "--font-rethink-sans",
  display: "swap",
  weight: "variable",
});

export const metadata: Metadata = {
  title: "Motovolt · Customer Registration",
  description: "Motovolt customer registration.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.ico" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#092d4b",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={rethinkSans.variable}>{children}</body>
    </html>
  );
}
