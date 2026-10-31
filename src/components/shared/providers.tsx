"use client";

import * as React from "react";
import { Toaster } from "sonner";
import { HtmlLang } from "@/lib/i18n/client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HtmlLang />
      {children}
      <Toaster richColors closeButton position="top-right" theme="light" />
    </>
  );
}
