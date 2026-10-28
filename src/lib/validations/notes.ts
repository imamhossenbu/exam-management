import { z } from "zod";

export function parseTags(input: string): string[] {
  return [...new Set(input.split(",").map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))];
}

export const noteSchema = z.object({
  title: z.string().trim().min(1, { message: "Give your note a title" }).max(200),
  subject: z.string().trim().max(100).default(""),
  chapter: z.string().trim().max(150).default(""),
  body: z.string().max(100000, { message: "This note is too long" }).default(""),
  tags: z
    .string()
    .default("")
    .transform(parseTags)
    .pipe(z.array(z.string().max(40, { message: "Each tag must be 40 characters or fewer" })).max(20, { message: "Use at most 20 tags" })),
});
export type NoteInput = z.input<typeof noteSchema>;
export type NoteOutput = z.output<typeof noteSchema>;
