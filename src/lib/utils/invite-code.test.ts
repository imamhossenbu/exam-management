import { describe, expect, it } from "vitest";
import { generateInviteCode, hashInviteCode, inviteCodeHint, normalizeInviteCode } from "./invite-code";

describe("invite codes", () => {
  it("generates formatted, unambiguous codes", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  it("does not repeat across many generations", () => {
    const codes = new Set(Array.from({ length: 2000 }, generateInviteCode));
    expect(codes.size).toBe(2000);
  });

  it("hashes independently of case and separators", () => {
    expect(hashInviteCode("abcd-2345 efgh")).toBe(hashInviteCode("ABCD2345EFGH"));
    expect(hashInviteCode("ABCD2345EFGH")).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizeInviteCode(" ab-cd ")).toBe("ABCD");
    expect(inviteCodeHint("ABCD-2345-EFGH")).toBe("EFGH");
  });
});
