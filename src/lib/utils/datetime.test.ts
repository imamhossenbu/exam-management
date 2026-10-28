import { describe, expect, it } from "vitest";
import { formatDuration, isValidTimeZone, utcToZonedInput, zonedInputToUtc } from "./datetime";

describe("timezone conversion", () => {
  it("converts local input in a fixed-offset zone to UTC", () => {
    expect(zonedInputToUtc("2026-03-01T09:30", "Asia/Dhaka")).toBe("2026-03-01T03:30:00.000Z");
  });

  it("round-trips through the zone", () => {
    const iso = zonedInputToUtc("2026-07-15T18:45", "America/New_York")!;
    expect(iso).toBe("2026-07-15T22:45:00.000Z");
    expect(utcToZonedInput(iso, "America/New_York")).toBe("2026-07-15T18:45");
  });

  it("handles daylight-saving transitions", () => {
    // Winter (EST, UTC-5) vs summer (EDT, UTC-4)
    expect(zonedInputToUtc("2026-01-10T12:00", "America/New_York")).toBe("2026-01-10T17:00:00.000Z");
    expect(zonedInputToUtc("2026-11-01T12:00", "America/New_York")).toBe("2026-11-01T17:00:00.000Z");
  });

  it("rejects malformed input and falls back to UTC for unknown zones", () => {
    expect(zonedInputToUtc("not a date", "UTC")).toBeNull();
    expect(zonedInputToUtc("2026-03-01T09:30", "Mars/Olympus")).toBe("2026-03-01T09:30:00.000Z");
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("Europe/London")).toBe(true);
  });

  it("formats countdowns", () => {
    expect(formatDuration(65_000)).toBe("01m 05s");
    expect(formatDuration(3_725_000)).toBe("1h 02m 05s");
    expect(formatDuration(-5)).toBe("00m 00s");
  });
});
