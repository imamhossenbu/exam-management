import { describe, expect, it } from "vitest";
import { banglaLetterIndex, hasBengali, optionLabel, toAsciiDigits } from "./bangla";

describe("bangla helpers", () => {
  it("detects Bengali script", () => {
    expect(hasBengali("বাংলাদেশের রাজধানী কোথায়?")).toBe(true);
    expect(hasBengali("What is RAM?", null, "র‍্যাম")).toBe(true);
    expect(hasBengali("What is RAM?")).toBe(false);
  });

  it("labels options like a board paper", () => {
    expect([0, 1, 2, 3].map((i) => optionLabel(i, true)).join("")).toBe("কখগঘ");
    expect([0, 1, 2, 3].map((i) => optionLabel(i, false)).join("")).toBe("ABCD");
    expect(banglaLetterIndex("গ")).toBe(2);
  });

  it("converts Bengali digits", () => {
    expect(toAsciiDigits("প্রশ্ন ১২ [২.৫ নম্বর]")).toBe("প্রশ্ন 12 [2.5 নম্বর]");
  });
});
