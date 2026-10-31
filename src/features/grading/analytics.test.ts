import { describe, expect, it } from "vitest";
import { parseOverview } from "./analytics";

describe("parseOverview", () => {
  it("normalises numeric strings and nulls from the results_overview RPC", () => {
    const o = parseOverview({
      submitted: 3, counted: 2, pending: 1, average: "75.5", passRate: null,
      exams: [{ examId: "e", examTitle: "T", courseTitle: "C", graded: 1, pending: 1, average: "75.5", highest: "75.5", lowest: "75.5", passRate: null }],
      students: [{ studentId: "s", studentName: "A", attempts: 1, average: "75.5", recent: ["75.50"], change: null }],
    });
    expect(o.average).toBe(75.5);
    expect(o.passRate).toBeNull();
    expect(o.exams[0].highest).toBe(75.5);
    expect(o.students[0].recent).toEqual([75.5]);
  });

  it("copes with an empty selection", () => {
    expect(parseOverview({ submitted: 0, counted: 0, pending: 0, average: null, passRate: null, exams: [], students: [] })).toMatchObject({ exams: [], students: [], average: null });
    expect(parseOverview(null).exams).toEqual([]);
  });
});
