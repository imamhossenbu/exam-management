import { describe, expect, it } from "vitest";
import { studentTrends, summarizeExams, type ScoredAttempt } from "./analytics";

const row = (over: Partial<ScoredAttempt>): ScoredAttempt => ({
  examId: "e1",
  examTitle: "Midterm",
  courseTitle: "Physics",
  studentId: "s1",
  studentName: "Ada",
  submittedAt: "2026-01-01T10:00:00Z",
  percentage: 50,
  passed: true,
  gradingStatus: "graded",
  ...over,
});

describe("results analytics", () => {
  it("summarises graded attempts and counts pending ones separately", () => {
    const [s] = summarizeExams([
      row({ percentage: 80, passed: true }),
      row({ studentId: "s2", percentage: 40, passed: false }),
      row({ studentId: "s3", percentage: null, gradingStatus: "pending", passed: null }),
    ]);
    expect(s).toMatchObject({ graded: 2, pending: 1, average: 60, highest: 80, lowest: 40, passRate: 50 });
  });

  it("returns nulls when nothing is graded yet", () => {
    const [s] = summarizeExams([row({ percentage: null, gradingStatus: "pending" })]);
    expect(s.average).toBeNull();
    expect(s.passRate).toBeNull();
  });

  it("orders each student's scores chronologically and reports the change", () => {
    const [t] = studentTrends([
      row({ submittedAt: "2026-03-01T00:00:00Z", percentage: 90, examId: "e3" }),
      row({ submittedAt: "2026-01-01T00:00:00Z", percentage: 60, examId: "e1" }),
      row({ submittedAt: "2026-02-01T00:00:00Z", percentage: 75, examId: "e2" }),
    ]);
    expect(t.recent).toEqual([60, 75, 90]);
    expect(t.change).toBe(30);
    expect(t.average).toBe(75);
  });
});
