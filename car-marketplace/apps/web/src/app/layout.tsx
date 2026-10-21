import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { env } from "@/lib/env";
import { BuyerProvider } from "@/components/buyer/buyer-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

// Self-hosted (no request to Google at runtime). One variable file covers weight and width.
const archivo = localFont({
  src: "../fonts/archivo-variable.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: `${env.appName} — buy and sell cars in Kenya`,
    template: `%s | ${env.appName}`,
  },
  description:
    "Buy and sell cars in Kenya. Listings from private sellers and verified dealers, starting in Mombasa and Nairobi.",
  openGraph: { siteName: env.appName, locale: "en_KE", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#f5c400",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-KE" className={archivo.variable}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-[var(--radius-control)] bg-ink px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <BuyerProvider>
          <SiteHeader />
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
        </BuyerProvider>
      </body>
    </html>
  );
}
