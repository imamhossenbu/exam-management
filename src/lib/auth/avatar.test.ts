import { describe, expect, it } from "vitest";
import { isBase64DataUrl } from "./avatar";

describe("isBase64DataUrl", () => {
  it("returns true for data:image/ URLs", () => {
    expect(isBase64DataUrl("data:image/webp;base64,UklGRnoAAABXRUJQVlA4...")).toBe(true);
    expect(isBase64DataUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...")).toBe(true);
  });

  it("returns false for regular relative avatar URLs", () => {
    expect(isBase64DataUrl("/avatars/user-123.webp")).toBe(false);
    expect(isBase64DataUrl("/avatars/user-123.webp?v=1730283921000")).toBe(false);
  });

  it("returns false for empty or null strings", () => {
    expect(isBase64DataUrl("")).toBe(false);
    expect(isBase64DataUrl(null)).toBe(false);
    expect(isBase64DataUrl(undefined)).toBe(false);
  });
});
