"use client";

import * as React from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthCard, EmailChip } from "@/components/shared/auth-card";
import { useServerAction } from "@/components/forms/use-server-action";
import { resendConfirmationAction, verifyEmailOtpAction } from "@/features/auth/actions";
import { cn } from "@/lib/utils/cn";
import { ResendButton } from "./resend-button";

type OtpVerifyCardProps = {
  email: string;
  onBack: () => void;
};

export function OtpVerifyCard({ email, onBack }: OtpVerifyCardProps) {
  const [digits, setDigits] = React.useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const verifyAction = useServerAction(verifyEmailOtpAction, {
    successToast: true,
    onError: (err) => setErrorMsg(err.error || "Invalid 6-digit verification code."),
  });

  const resend = useServerAction(resendConfirmationAction, {
    successMessage: "A new 6-digit verification code has been sent to your email.",
  });

  const token = digits.join("");
  const isComplete = token.length === 6 && /^[0-9]{6}$/.test(token);

  // Auto-focus first input on mount
  React.useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleDigitChange(index: number, value: string) {
    setErrorMsg(null);
    const cleaned = value.replace(/[^0-9]/g, "");

    if (cleaned.length > 1) {
      // User pasted multiple digits into one box
      handlePaste(cleaned);
      return;
    }

    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);

    // Auto-advance
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(pastedData: string) {
    const numbersOnly = pastedData.replace(/[^0-9]/g, "").slice(0, 6);
    if (!numbersOnly) return;

    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < numbersOnly.length; i++) {
      next[i] = numbersOnly[i];
    }
    setDigits(next);

    const focusIndex = Math.min(numbersOnly.length, 5);
    inputRefs.current[focusIndex]?.focus();
  }

  async function handleVerify(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!isComplete || verifyAction.pending) return;
    setErrorMsg(null);
    await verifyAction.run({ email, token });
  }

  return (
    <AuthCard
      icon={ShieldCheck}
      tone="brand"
      title="Enter verification code"
      description="We sent a 6-digit security code to"
      footer={
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Use a different email
        </button>
      }
    >
      <div role="status" className="-mt-2 mb-3.5 sm:mb-4 text-center">
        <EmailChip email={email} />
      </div>

      <form onSubmit={handleVerify} className="grid gap-4">
        <div className="grid gap-2 text-center">
          <label className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/70">
            6-digit security code
          </label>
          
          <div
            className="flex items-center justify-center gap-2 py-1"
            onPaste={(e) => {
              e.preventDefault();
              handlePaste(e.clipboardData.getData("text"));
            }}
          >
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                aria-label={`Digit ${idx + 1}`}
                className={cn(
                  "size-10 sm:size-11 rounded-xl border text-center font-mono text-lg sm:text-xl font-bold transition-all duration-150 outline-none select-none",
                  digit
                    ? "border-primary/80 bg-primary/15 text-white ring-1 ring-primary/40 shadow-xs"
                    : "border-white/20 bg-white/[0.06] text-white/40 hover:border-white/35",
                  "focus:border-primary focus:bg-primary/20 focus:text-white focus:ring-2 focus:ring-primary/50 focus:scale-[1.05]",
                )}
              />
            ))}
          </div>

          {errorMsg ? (
            <p role="alert" className="text-xs text-destructive font-medium mt-1">
              {errorMsg}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="md"
          className="w-full h-10 text-xs sm:text-sm font-semibold shadow-md gap-2"
          pending={verifyAction.pending}
          disabled={!isComplete}
        >
          {verifyAction.pending ? "Verifying code…" : "Verify and continue"}
        </Button>

        <div className="pt-3 border-t border-white/10 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs w-full gap-2">
            <span className="text-white/60 whitespace-nowrap">Didn&apos;t get the code?</span>
            <ResendButton
              variant="outline"
              size="sm"
              label="code"
              className="h-8 px-3 text-xs rounded-lg border-white/15 bg-white/5 text-white/90 hover:bg-white/10 shrink-0 gap-1.5"
              pending={resend.pending}
              onResend={async () => Boolean((await resend.run({ email }))?.ok)}
            />
          </div>
          <p className="text-center text-[11px] leading-relaxed text-white/45">
            You can also click the confirmation link in the email to verify instantly. The code expires in 1 hour.
          </p>
        </div>
      </form>
    </AuthCard>
  );
}
