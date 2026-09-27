import type { Metadata, Viewport } from "next";
import { Archivo, Courier_Prime } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const courier = Courier_Prime({ variable: "--font-courier", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: { default: "Waypoint People", template: "%s · Waypoint People" },
  description: "The HR department's records for Waypoint: staff in every role, driving licences, sign-in access and the activity log.",
  applicationName: "Waypoint People",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#2e4a3e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${courier.variable} h-full antialiased`}>
      <body className="min-h-full font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
