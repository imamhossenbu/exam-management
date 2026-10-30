import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, Clock, FileText, NotebookPen, ScanText, ShieldCheck, Sparkles, Ticket } from "lucide-react";
import { Brand } from "@/components/shared/brand";
import { PublicNavUser, PublicNavUserSkeleton } from "@/components/shared/public-nav-user";
import { Button } from "@/components/ui/button";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const FEATURES = [
  { icon: Clock, title: "Timed online exams", body: "MCQ, written and mixed exams with server-enforced deadlines, autosave and recovery from network drops." },
  { icon: ClipboardCheck, title: "Fair, fast grading", body: "Instant MCQ scoring with negative marking, plus annotated grading of handwritten answer sheets." },
  { icon: ScanText, title: "Import from paper", body: "Turn PDFs and photos of question papers into reviewed draft questions in minutes." },
  { icon: NotebookPen, title: "Personal study notes", body: "Students organise notes by subject and chapter, with tags, search and private attachments." },
  { icon: ShieldCheck, title: "Private by design", body: "Every record is protected by row-level security. Answer keys never reach students early." },
  { icon: FileText, title: "Results and insights", body: "Controlled result release, per-exam statistics, student trends and CSV export." },
];

const STEPS = [
  { icon: Ticket, title: "Join with a code", body: "Create a student account and enter the invitation code from your teacher." },
  { icon: Clock, title: "Take your exam", body: "Answers save as you go. The timer is kept by the server, so a reload never costs you time." },
  { icon: CheckCircle2, title: "Get feedback", body: "See your marks, comments and annotated answer sheets once results are released." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />
      <header className="fixed top-0 inset-x-0 z-40 border-b border-border/40 bg-background/85 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 md:px-6">
          <Brand />
          <Suspense fallback={<PublicNavUserSkeleton />}>
            <PublicNavUser />
          </Suspense>
        </div>
      </header>

      <main className="flex-1 pt-14">
        <section className="relative isolate overflow-hidden">
          <div className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" aria-hidden />
          <div className="absolute top-[-10rem] left-1/2 -z-10 h-[28rem] w-[46rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-20 blur-3xl" aria-hidden />
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 pt-8 pb-10 text-center sm:pt-12 sm:pb-14 md:px-6 md:pt-14 md:pb-16">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-surface/80 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-card backdrop-blur">
              <Sparkles className="size-3 text-primary" aria-hidden /> A private exam room for your class
            </span>
            <h1 className="mt-4 max-w-xl text-xl font-semibold tracking-[-0.025em] text-balance sm:text-2xl md:text-[2rem] md:leading-[1.2]">
              Exams, grading and notes in <span className="text-brand-gradient">one calm place.</span>
            </h1>
            <p className="text-subtle mt-3 max-w-md text-xs sm:text-sm text-pretty leading-relaxed">
              Take timed exams, upload handwritten answers and review detailed feedback. New students sign up and join with the invitation code from their teacher.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button asChild size="sm" className="h-9 px-4 text-xs font-medium">
                <Link href="/signup">
                  Create student account <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-9 px-4 text-xs font-medium">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-12 sm:pb-16 md:px-6" aria-labelledby="features-heading">
          <h2 id="features-heading" className="text-center text-base font-semibold tracking-tight sm:text-lg md:text-xl">
            Everything a class needs
          </h2>
          <p className="text-subtle mx-auto mt-1 max-w-md text-center text-xs">Built for one teacher and their students, with security and fairness at the core.</p>
          <ul className="mt-6 sm:mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="surface surface-interactive p-3.5 sm:p-4">
                <span className="grid size-7.5 sm:size-8 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                  <f.icon className="size-3.5 sm:size-4" aria-hidden />
                </span>
                <h3 className="section-title mt-2.5 text-xs sm:text-[13px] font-semibold">{f.title}</h3>
                <p className="text-subtle mt-1 text-[11px] sm:text-xs leading-relaxed">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-y bg-muted/40" aria-labelledby="steps-heading">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12 md:px-6">
            <h2 id="steps-heading" className="text-center text-base font-semibold tracking-tight sm:text-lg md:text-xl">
              How it works for students
            </h2>
            <ol className="mt-6 sm:mt-8 grid gap-4 sm:gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col items-center text-center">
                  <span className="relative grid size-9 sm:size-9.5 place-items-center rounded-lg border bg-surface shadow-elevated">
                    <s.icon className="size-4 text-primary" aria-hidden />
                    <span className="absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full bg-brand-gradient text-[10px] font-semibold text-white">{i + 1}</span>
                  </span>
                  <h3 className="section-title mt-2.5 text-xs sm:text-[13px] font-semibold">{s.title}</h3>
                  <p className="text-subtle mt-1 text-[11px] sm:text-xs max-w-xs">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-8 sm:py-10 md:px-6">
          <div className="relative overflow-hidden rounded-xl bg-brand-gradient px-4 py-6 text-center text-white shadow-elevated sm:px-6 sm:py-8">
            <div className="bg-grid absolute inset-0 opacity-20" aria-hidden />
            <h2 className="relative text-base font-semibold tracking-tight sm:text-lg md:text-xl">Ready for your next exam?</h2>
            <p className="relative mx-auto mt-1 max-w-sm text-xs text-white/80">Sign in to see what&apos;s coming up, or create your account to join your course.</p>
            <div className="relative mt-4 flex flex-col justify-center gap-2 sm:flex-row">
              <Button asChild size="sm" variant="secondary" className="h-8.5 px-3.5 text-xs bg-white text-[oklch(0.3_0.1_277)] hover:bg-white/90">
                <Link href="/signup">Create account</Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="h-8.5 px-3.5 text-xs text-white hover:bg-white/15 hover:text-white">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2.5 px-4 py-6 text-xs sm:text-sm text-muted-foreground sm:flex-row md:px-6">
          <Brand subtle />
          <p>Private exam platform · Your data stays with your class.</p>
        </div>
      </footer>
    </div>
  );
}
