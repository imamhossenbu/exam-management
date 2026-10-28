import { describe, expect, it } from "vitest";
import { ACCEPTED_DOCUMENT_TYPES, LIMITS, formatBytes, safeFileName, validateFile } from "./files";

describe("file validation", () => {
  it("accepts supported types within the limit", () => {
    expect(validateFile({ name: "a.pdf", type: "application/pdf", size: 1000 }, ACCEPTED_DOCUMENT_TYPES, LIMITS.answerSheet)).toBeNull();
  });

  it("rejects unsupported types, empty and oversized files", () => {
    expect(validateFile({ name: "a.exe", type: "application/x-msdownload", size: 10 }, ACCEPTED_DOCUMENT_TYPES, 100)).toMatch(/unsupported/);
    expect(validateFile({ name: "a.png", type: "image/png", size: 0 }, ACCEPTED_DOCUMENT_TYPES, 100)).toMatch(/empty/);
    expect(validateFile({ name: "a.png", type: "image/png", size: 101 }, ACCEPTED_DOCUMENT_TYPES, 100)).toMatch(/larger/);
  });

  it("formats sizes and sanitises names", () => {
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(safeFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
  });
});
