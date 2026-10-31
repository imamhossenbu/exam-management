import { z } from "zod";
import { uuid } from "./courses";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const optionalNumber = (schema: z.ZodNumber) =>
  z.union([z.literal(""), z.null(), z.coerce.number().pipe(schema)]).transform((v) => (v === "" || v === null ? null : v));
const marks = (max: number) => z.coerce.number({ message: "Enter a number" }).positive({ message: "Must be more than 0" }).max(max).multipleOf(0.25, { message: "Use steps of 0.25" });
const optionalText = (max: number) => z.string().trim().max(max).default("");

export const examSettingsSchema = z
  .object({
    courseId: uuid,
    // "No subject" may arrive as "", null or undefined (the select is disabled until a course is chosen).
    subjectId: z.preprocess((v) => v ?? "", z.union([z.literal(""), uuid])).transform((v) => v || null),
    chapterIds: z.array(uuid).max(50).default([]),
    title: z.string().trim().min(2, { message: "Use at least 2 characters" }).max(200),
    description: optionalText(4000),
    instructions: optionalText(8000),
    examType: z.enum(["mcq", "cq", "mixed"]),
    totalMarks: marks(10000),
    passMarks: optionalNumber(z.number().min(0).max(10000)),
    durationMinutes: z.coerce.number().int({ message: "Whole minutes only" }).min(1).max(1440),
    // Mixed exams only: a separately timed MCQ section that comes first and locks when it ends.
    mcqDurationMinutes: optionalNumber(z.number().int({ message: "Whole minutes only" }).min(1, { message: "At least 1 minute" }).max(1439)).default(null),
    startsAt: z.string().regex(LOCAL_DATETIME, { message: "Choose a start date and time" }),
    endsAt: z.string().regex(LOCAL_DATETIME, { message: "Choose an end date and time" }),
    maxAttempts: z.coerce.number().int().min(1).max(20),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    resultsRelease: z.enum(["immediate", "after_close", "manual"]),
    /** With several attempts: which one is the student's result. */
    resultPolicy: z.enum(["best", "latest"]).default("best"),
    revealAnswers: z.boolean().default(true),
    allowResubmission: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The exam must end after it starts" });
    if (v.passMarks !== null && v.passMarks > v.totalMarks)
      ctx.addIssue({ code: "custom", path: ["passMarks"], message: "Pass mark can't exceed total marks" });
    if (v.examType === "mixed" && v.mcqDurationMinutes !== null && v.mcqDurationMinutes >= v.durationMinutes)
      ctx.addIssue({ code: "custom", path: ["mcqDurationMinutes"], message: "Must be shorter than the total duration, leaving time for the written part" });
    if (v.allowResubmission && v.examType === "mcq")
      ctx.addIssue({ code: "custom", path: ["allowResubmission"], message: "Only exams with written questions can be returned for correction" });
  });
export type ExamSettingsInput = z.input<typeof examSettingsSchema>;
/** The MCQ section time only applies to mixed exams; other types always store null. */
export function effectiveMcqMinutes(v: Pick<ExamSettingsOutput, "examType" | "mcqDurationMinutes">) {
  return v.examType === "mixed" ? v.mcqDurationMinutes : null;
}
export type ExamSettingsOutput = z.output<typeof examSettingsSchema>;

export const questionSchema = z
  .object({
    type: z.enum(["mcq", "cq"]),
    body: z.string().trim().min(1, { message: "Enter the question" }).max(10000),
    imagePath: z.string().max(500).nullable().default(null),
    marks: marks(1000),
    negativeMarks: z.coerce.number().min(0).max(1000).multipleOf(0.25, { message: "Use steps of 0.25" }).default(0),
    options: z
      .array(z.object({ body: z.string().trim().min(1, { message: "Option text is required" }).max(2000) }))
      .max(10, { message: "At most 10 options" })
      .default([]),
    correctIndex: z.coerce.number().int().min(-1).default(-1),
    parts: z
      .array(
        z.object({
          label: z.string().trim().min(1, { message: "Label required" }).max(10),
          body: z.string().trim().min(1, { message: "Enter the sub-question" }).max(5000),
          marks: marks(1000),
        }),
      )
      .max(20)
      .default([]),
    explanation: optionalText(10000),
    modelAnswer: optionalText(20000),
    rubric: optionalText(20000),
    sourceId: z.union([uuid, z.null()]).default(null),
  })
  .superRefine((q, ctx) => {
    if (q.type === "mcq") {
      if (q.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two options" });
      if (q.correctIndex < 0 || q.correctIndex >= q.options.length)
        ctx.addIssue({ code: "custom", path: ["correctIndex"], message: "Select the correct option" });
      if (q.negativeMarks > q.marks) ctx.addIssue({ code: "custom", path: ["negativeMarks"], message: "Negative marks can't exceed the question's marks" });
    } else if (q.parts.length > 0) {
      const sum = q.parts.reduce((s, p) => s + p.marks, 0);
      if (Math.abs(sum - q.marks) > 0.001)
        ctx.addIssue({ code: "custom", path: ["parts"], message: `Sub-question marks add up to ${sum}, but the question is worth ${q.marks}` });
    }
  });
export type QuestionInput = z.input<typeof questionSchema>;
export type QuestionOutput = z.output<typeof questionSchema>;

/** Converts validated form values into the save_question() JSON payload. */
export function toQuestionPayload(q: QuestionOutput) {
  return {
    type: q.type,
    body: q.body,
    image_path: q.imagePath,
    marks: q.marks,
    negative_marks: q.type === "mcq" ? q.negativeMarks : 0,
    options: q.type === "mcq" ? q.options.map((o, i) => ({ body: o.body, is_correct: i === q.correctIndex })) : [],
    parts: q.type === "cq" ? q.parts : [],
    explanation: q.explanation || null,
    model_answer: q.type === "cq" ? q.modelAnswer || null : null,
    rubric: q.type === "cq" ? q.rubric || null : null,
    source_id: q.sourceId,
  };
}
