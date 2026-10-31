import { GraduationCap } from "lucide-react";
import { T } from "@/lib/i18n/client";

export function Brand({ subtle = false }: { subtle?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-[0.6rem] bg-brand-gradient text-primary-foreground shadow-[0_2px_8px_-2px_oklch(0.5_0.2_290/0.5),inset_0_1px_0_oklch(1_0_0/0.25)]">
        <GraduationCap className="size-4 text-white" aria-hidden />
      </span>
      <span className={subtle ? "text-foreground/90" : undefined}><T>ExamDesk</T></span>
    </span>
  );
}
