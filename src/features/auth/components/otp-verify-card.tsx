"use client";

import * as React from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthCard, EmailChip } from "@/components/shared/auth-card";
import { useServerAction } from "@/components/forms/use-server-action";
import { resendConfirmationAction, verifyEmailOtpAction } from "@/features/auth/actions";
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
      description="We sent a 6-digit code to"
      footer={
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 font-medium text-white/80 hover:text-white transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden /> Use a different email
        </button>
      }
    >
      <div role="status" className="-mt-2.5 mb-4 sm:mb-5 text-center">
        <EmailChip email={email} />
      </div>

      <form onSubmit={handleVerify} className="grid gap-4">
        <div className="grid gap-1.5 text-center">
          <label className="text-xs sm:text-sm font-medium text-white/90">
            6-digit security code
          </label>
          
          <div
            className="flex items-center justify-center gap-1.5 sm:gap-2 py-1"
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
                className="size-8.5 sm:size-9 rounded-lg border border-white/15 bg-white/5 text-center font-mono text-base sm:text-lg font-bold text-white shadow-inner transition-all focus:border-primary focus:bg-primary/10 focus:ring-2 focus:ring-primary/40 focus:outline-none"
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
          className="w-full mt-0.5 h-9 sm:h-9.5 text-xs sm:text-sm font-semibold shadow-sm"
          pending={verifyAction.pending}
          disabled={!isComplete}
        >
          Verify and continue
        </Button>

        <div className="pt-2 border-t border-white/10 grid gap-2.5">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>Didn&apos;t get the code?</span>
            <ResendButton
              pending={resend.pending}
              onResend={async () => Boolean((await resend.run({ email }))?.ok)}
            />
          </div>
          <p className="text-center text-xs text-white/45">
            You can also click the confirmation link in the email to verify instantly. The code expires in 1 hour.
          </p>
        </div>
      </form>
    </AuthCard>
  );
}
