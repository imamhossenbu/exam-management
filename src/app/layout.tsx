import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import { Providers } from "@/components/shared/providers";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${notoBengali.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
