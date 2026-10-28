import { z } from "zod";

const email = z.string().trim().toLowerCase().max(320).pipe(z.email({ message: "Enter a valid email address" }));
const password = z
  .string()
  .min(8, { message: "Use at least 8 characters" })
  .max(72, { message: "Use at most 72 characters" });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { message: "Enter your password" }).max(72),
  next: z.string().optional(),
});

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, { message: "Enter your full name" }).max(120),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, { message: "Enter your full name" }).max(120),
  timezone: z.string().min(1).max(64),
});

export type SignInInput = z.input<typeof signInSchema>;
export type SignUpInput = z.input<typeof signUpSchema>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ProfileInput = z.input<typeof profileSchema>;

/** Only same-origin relative paths are accepted as post-login destinations. */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
