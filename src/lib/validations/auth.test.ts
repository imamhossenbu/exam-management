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

describe("invite code validation", () => {
  it("treats an empty max-uses / expiry box as unlimited, however the form sends it", async () => {
    const { inviteSchema } = await import("./courses");
    const base = { courseId: "6f1b8c2e-1f1a-4a3a-9a6e-2d3f4a5b6c7d", label: "" };
    for (const empty of ["", null, undefined]) {
      const r = inviteSchema.parse({ ...base, expiresInDays: empty, maxUses: empty });
      expect(r.maxUses).toBeNull();
      expect(r.expiresInDays).toBeNull();
    }
    expect(inviteSchema.parse({ ...base, expiresInDays: "14", maxUses: "5" })).toMatchObject({ expiresInDays: 14, maxUses: 5 });
    expect(inviteSchema.safeParse({ ...base, expiresInDays: "", maxUses: "0" }).success).toBe(false);
  });
});
