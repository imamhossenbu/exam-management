import { describe, expect, it } from "vitest";
import { parseQuestions } from "./parse-questions";

describe("parseQuestions", () => {
  it("splits numbered MCQs with options on separate lines and reads answer hints", () => {
    const text = `Physics Quiz
1. What is the SI unit of force? [1 mark]
a) Joule
b) Newton
c) Watt
d) Pascal
Answer: b
2) Light travels fastest in
(a) water
(b) glass
(c) vacuum
(d) diamond`;
    const qs = parseQuestions(text);
    expect(qs).toHaveLength(2);
    expect(qs[0]).toMatchObject({ type: "mcq", body: "What is the SI unit of force?", options: ["Joule", "Newton", "Watt", "Pascal"], suggestedCorrectIndex: 1, marks: 1 });
    expect(qs[1].options).toEqual(["water", "glass", "vacuum", "diamond"]);
    expect(qs[1].suggestedCorrectIndex).toBe(-1);
  });

  it("handles inline options and treats option-less questions as written", () => {
    const text = `Q1. 2 + 2 = ? (a) 3 (b) 4 (c) 5 (d) 6
Q2. Explain Newton's third law with an example. (5 marks)
Q3: Describe photosynthesis.
It happens in leaves.`;
    const qs = parseQuestions(text);
    expect(qs[0]).toMatchObject({ type: "mcq", body: "2 + 2 = ?", options: ["3", "4", "5", "6"] });
    expect(qs[1]).toMatchObject({ type: "cq", body: "Explain Newton's third law with an example.", marks: 5 });
    expect(qs[2].body).toBe("Describe photosynthesis.\nIt happens in leaves.");
  });

  it("ignores stray numbers that are out of sequence", () => {
    const qs = parseQuestions(`1. Name a gas found in air.\n2016. Not a question number\n2. Name a liquid.`);
    expect(qs).toHaveLength(2);
    expect(qs[0].body).toContain("2016. Not a question number");
  });

  it("returns nothing for text without numbered questions", () => {
    expect(parseQuestions("Just some notes without numbering")).toEqual([]);
  });
});
