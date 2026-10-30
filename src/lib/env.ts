import { z } from "zod";

/**
 * Public configuration, safe for the browser. Values are inlined at build time,
 * so each variable must be referenced literally.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20, { message: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing or incomplete" })
    .refine((v) => !v.startsWith("PASTE_") && !v.startsWith("YOUR_"), {
      message: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY still contains the placeholder value",
    }),
  NEXT_SITE_URL: z.url().optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | null = null;

export class ConfigurationError extends Error {
  constructor(issues: string[]) {
    super(`Invalid configuration:\n- ${issues.join("\n- ")}\nSee .env.local.example and README.md.`);
    this.name = "ConfigurationError";
  }
}

/** Validates public env vars. Error messages never include the values. */
export function getPublicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_SITE_URL: process.env.NEXT_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || undefined,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || undefined,
  });
  if (!parsed.success) {
    throw new ConfigurationError(parsed.error.issues.map((i) => i.message));
  }
  cached = parsed.data;
  return cached;
}

export function isConfigured(): boolean {
  try {
    getPublicEnv();
    return true;
  } catch {
    return false;
  }
}
