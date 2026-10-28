import { z } from "zod";

export const uuid = z.uuid({ message: "Invalid id" });

export const courseSchema = z.object({
  title: z.string().trim().min(2, { message: "Use at least 2 characters" }).max(120),
  code: z
    .string()
    .trim()
    .max(30, { message: "Use at most 30 characters" })
    .transform((v) => v || null)
    .nullable(),
  description: z.string().trim().max(4000).default(""),
});
export type CourseInput = z.input<typeof courseSchema>;

export const inviteSchema = z.object({
  courseId: uuid,
  label: z
    .string()
    .trim()
    .max(80)
    .transform((v) => v || null)
    .nullable(),
  /** Days until expiry; empty means no expiry. */
  expiresInDays: z.union([z.literal(""), z.coerce.number().int().min(1).max(365)]).transform((v) => (v === "" ? null : v)),
  maxUses: z.union([z.literal(""), z.coerce.number().int().min(1).max(10000)]).transform((v) => (v === "" ? null : v)),
});
export type InviteInput = z.input<typeof inviteSchema>;

export const memberStatusSchema = z.object({
  memberId: uuid,
  status: z.enum(["active", "suspended", "removed"]),
});

export const enrollByEmailSchema = z.object({
  courseId: uuid,
  email: z.string().trim().toLowerCase().max(320).pipe(z.email({ message: "Enter a valid email address" })),
});
export type EnrollByEmailInput = z.input<typeof enrollByEmailSchema>;

export const subjectSchema = z.object({
  courseId: uuid,
  name: z.string().trim().min(1, { message: "Enter a name" }).max(100),
});

export const chapterSchema = z.object({
  subjectId: uuid,
  name: z.string().trim().min(1, { message: "Enter a name" }).max(150),
});

export const renameSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, { message: "Enter a name" }).max(150),
});

export const joinCourseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, { message: "Enter the invitation code" })
    .max(40)
    .refine((v) => v.replace(/[^A-Za-z0-9]/g, "").length >= 8, { message: "That code looks too short" }),
});
export type JoinCourseInput = z.input<typeof joinCourseSchema>;
