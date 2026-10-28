import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes separators, quotes and newlines", () => {
    expect(toCsv([["a,b", 'say "hi"', "line\nbreak"]])).toBe('"a,b","say ""hi""","line\nbreak"');
  });
  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(toCsv([["=HYPERLINK(1)", "-0.5", "@cmd", null]])).toBe("'=HYPERLINK(1),-0.5,'@cmd,");
  });
});
