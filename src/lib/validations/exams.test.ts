import { describe, expect, it } from "vitest";
import { examSettingsSchema, questionSchema, toQuestionPayload } from "./exams";

const exam = {
  courseId: "6f1b8c2e-1f1a-4a3a-9a6e-2d3f4a5b6c7d",
  subjectId: "",
  title: "Midterm",
  examType: "mcq",
  totalMarks: "20",
  passMarks: "",
  durationMinutes: "30",
  startsAt: "2026-05-01T09:00",
  endsAt: "2026-05-01T11:00",
  maxAttempts: "1",
  resultsRelease: "after_close",
} as const;

describe("exam settings validation", () => {
  it("coerces form strings and nulls optional fields", () => {
    const v = examSettingsSchema.parse(exam);
    expect(v.totalMarks).toBe(20);
    expect(v.passMarks).toBeNull();
    expect(v.subjectId).toBeNull();
  });

  it("rejects an end before the start and pass marks above the total", () => {
    const r = examSettingsSchema.safeParse({ ...exam, endsAt: "2026-05-01T08:00", passMarks: "25" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toContain("endsAt");
    expect(paths).toContain("passMarks");
  });
});

describe("question validation", () => {
  const mcq = { type: "mcq", body: "2+2?", marks: "2", negativeMarks: "0.5", options: [{ body: "4" }, { body: "5" }], correctIndex: 0 } as const;

  it("requires at least two options and exactly one correct option", () => {
    expect(questionSchema.safeParse({ ...mcq, options: [{ body: "4" }] }).success).toBe(false);
    expect(questionSchema.safeParse({ ...mcq, correctIndex: -1 }).success).toBe(false);
    expect(questionSchema.safeParse({ ...mcq, correctIndex: 5 }).success).toBe(false);
  });

  it("caps negative marking at the question's marks", () => {
    expect(questionSchema.safeParse({ ...mcq, negativeMarks: "3" }).success).toBe(false);
  });

  it("requires sub-question marks to add up", () => {
    const cq = { type: "cq", body: "Explain", marks: "10", parts: [{ label: "a", body: "x", marks: "4" }, { label: "b", body: "y", marks: "5" }] } as const;
    expect(questionSchema.safeParse(cq).success).toBe(false);
    expect(questionSchema.safeParse({ ...cq, marks: "9" }).success).toBe(true);
  });

  it("builds a payload with a single correct flag and no CQ secrets on MCQs", () => {
    const payload = toQuestionPayload(questionSchema.parse({ ...mcq, correctIndex: 1, modelAnswer: "leak?" }));
    expect(payload.options.map((o) => o.is_correct)).toEqual([false, true]);
    expect(payload.model_answer).toBeNull();
  });
});
