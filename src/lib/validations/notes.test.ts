import { describe, expect, it } from "vitest";
import { noteSchema, parseTags } from "./notes";

describe("notes validation", () => {
  it("normalises and de-duplicates tags", () => {
    expect(parseTags(" Exam Prep, exam prep ,Formula,, ")).toEqual(["exam-prep", "formula"]);
  });
  it("requires a title and limits tags", () => {
    expect(noteSchema.safeParse({ title: "" }).success).toBe(false);
    expect(noteSchema.safeParse({ title: "x", tags: Array.from({ length: 21 }, (_, i) => `t${i}`).join(",") }).success).toBe(false);
  });
});
