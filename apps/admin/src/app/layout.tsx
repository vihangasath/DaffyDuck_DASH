import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Waypoint Admin", template: "%s · Waypoint Admin" },
  description: "Drivers, branches, vehicles, depots, products and accounts for Waypoint delivery planning.",
  applicationName: "Waypoint Admin",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0c1e2b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
