import { describe, expect, it } from "vitest";
import { safeNextPath, signUpSchema } from "./auth";

describe("auth validation", () => {
  it("only accepts same-origin relative redirects", () => {
    expect(safeNextPath("/teacher/exams")).toBe("/teacher/exams");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });

  it("requires matching passwords and normalises email", () => {
    const bad = signUpSchema.safeParse({ fullName: "Ada", email: "a@b.co", password: "12345678", confirmPassword: "x" });
    expect(bad.success).toBe(false);
    const good = signUpSchema.parse({ fullName: "Ada", email: " ADA@Example.com ", password: "12345678", confirmPassword: "12345678" });
    expect(good.email).toBe("ada@example.com");
  });

  it("never accepts a role field", () => {
    const parsed = signUpSchema.parse({ fullName: "Ada", email: "a@b.co", password: "12345678", confirmPassword: "12345678", role: "teacher" } as never);
    expect(parsed).not.toHaveProperty("role");
  });
});
