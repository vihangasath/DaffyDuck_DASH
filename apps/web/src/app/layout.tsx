import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Waypoint Delivery Planning", template: "%s · Waypoint" },
  description: "Ordering, planning, loading, delivery and receipt for Waypoint Fresh, Style and Tech.",
  applicationName: "Waypoint",
};

export const viewport: Viewport = { themeColor: "#0c1e2b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
