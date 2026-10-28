import { describe, expect, it } from "vitest";
import { examPhase } from "./status";

const base = { starts_at: "2026-01-01T10:00:00Z", ends_at: "2026-01-01T12:00:00Z" };
const t = (iso: string) => new Date(iso).getTime();

describe("exam availability", () => {
  it("derives the phase from status and the exam window", () => {
    expect(examPhase({ ...base, status: "draft" }, t("2026-01-01T11:00:00Z"))).toBe("draft");
    expect(examPhase({ ...base, status: "published" }, t("2026-01-01T09:59:59Z"))).toBe("scheduled");
    expect(examPhase({ ...base, status: "published" }, t("2026-01-01T10:00:00Z"))).toBe("live");
    expect(examPhase({ ...base, status: "published" }, t("2026-01-01T12:00:00Z"))).toBe("ended");
    expect(examPhase({ ...base, status: "closed" }, t("2026-01-01T11:00:00Z"))).toBe("closed");
    expect(examPhase({ ...base, status: "archived" }, t("2026-01-01T11:00:00Z"))).toBe("archived");
  });
});
