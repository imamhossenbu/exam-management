export type ExamSummary = {
  examId: string;
  examTitle: string;
  courseTitle: string;
  graded: number;
  pending: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
};

export type StudentTrend = { studentId: string; studentName: string; attempts: number; average: number; recent: number[]; change: number | null };

export type ResultsOverview = {
  /** All submitted attempts in the selection. */
  submitted: number;
  /** One per student and exam: the attempt that counts (best or latest, per exam setting). */
  counted: number;
  pending: number;
  average: number | null;
  passRate: number | null;
  exams: ExamSummary[];
  students: StudentTrend[];
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Normalises the JSON returned by the results_overview() RPC (numerics arrive as numbers or strings). */
export function parseOverview(raw: unknown): ResultsOverview {
  const o = (raw ?? {}) as Record<string, unknown>;
  const exams = (o.exams as Record<string, unknown>[] | undefined) ?? [];
  const students = (o.students as Record<string, unknown>[] | undefined) ?? [];
  return {
    submitted: Number(o.submitted ?? 0),
    counted: Number(o.counted ?? 0),
    pending: Number(o.pending ?? 0),
    average: num(o.average),
    passRate: num(o.passRate),
    exams: exams.map((e) => ({
      examId: String(e.examId),
      examTitle: String(e.examTitle),
      courseTitle: String(e.courseTitle),
      graded: Number(e.graded),
      pending: Number(e.pending),
      average: num(e.average),
      highest: num(e.highest),
      lowest: num(e.lowest),
      passRate: num(e.passRate),
    })),
    students: students.map((t) => ({
      studentId: String(t.studentId),
      studentName: String(t.studentName),
      attempts: Number(t.attempts),
      average: Number(t.average),
      recent: ((t.recent as unknown[]) ?? []).map(Number),
      change: num(t.change),
    })),
  };
}
