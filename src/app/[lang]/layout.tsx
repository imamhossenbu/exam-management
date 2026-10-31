import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { Providers } from "@/components/shared/providers";
import { LocaleProvider } from "@/lib/i18n/client";
import { isLocale, LOCALES } from "@/lib/i18n/config";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Bangla questions and answers: Geist has no Bengali glyphs, so Bengali text falls through to this
// font (full conjunct coverage). Only the Bengali subset is loaded, and only on pages that show Bangla.
const notoBengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
  display: "swap",
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Online Exam Management System`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["online exam", "exam management system", "MCQ exam", "written exam", "online test", "teacher", "students", "grading", "results", "ExamDesk"],
  openGraph: { type: "website", siteName: SITE_NAME, url: "/", title: `${SITE_NAME} — Online Exam Management System`, description: SITE_DESCRIPTION, locale: "en_US" },
  twitter: { card: "summary_large_image", title: `${SITE_NAME} — Online Exam Management System`, description: SITE_DESCRIPTION },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  colorScheme: "light",
};

// One prerendered shell per interface language; the proxy picks one from the `lang` cookie
// without changing the URL (see src/proxy.ts).
export async function generateStaticParams() {
  return LOCALES.map((l) => ({ lang: l }));
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const value = await lang();
  if (!isLocale(value)) notFound();
  return (
    <html lang={value} className={`${geistSans.variable} ${notoBengali.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LocaleProvider locale={value}>
          <Providers>{children}</Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
