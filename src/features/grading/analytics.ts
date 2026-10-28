export type ScoredAttempt = {
  examId: string;
  examTitle: string;
  courseTitle: string;
  studentId: string;
  studentName: string;
  submittedAt: string | null;
  percentage: number | null;
  passed: boolean | null;
  gradingStatus: string;
};

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

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Per-exam statistics over fully graded attempts. Pending attempts are counted but not scored. */
export function summarizeExams(rows: ScoredAttempt[]): ExamSummary[] {
  const byExam = new Map<string, ScoredAttempt[]>();
  for (const r of rows) (byExam.get(r.examId) ?? byExam.set(r.examId, []).get(r.examId)!).push(r);
  return [...byExam.values()].map((list) => {
    const graded = list.filter((r) => r.gradingStatus === "graded" && r.percentage !== null);
    const pcts = graded.map((r) => r.percentage!);
    const withPass = graded.filter((r) => r.passed !== null);
    return {
      examId: list[0].examId,
      examTitle: list[0].examTitle,
      courseTitle: list[0].courseTitle,
      graded: graded.length,
      pending: list.length - graded.length,
      average: pcts.length ? round1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      highest: pcts.length ? Math.max(...pcts) : null,
      lowest: pcts.length ? Math.min(...pcts) : null,
      passRate: withPass.length ? round1((withPass.filter((r) => r.passed).length / withPass.length) * 100) : null,
    };
  });
}

export type StudentTrend = { studentId: string; studentName: string; attempts: number; average: number; recent: number[]; change: number | null };

/** Per-student averages and recent scores (oldest → newest) to show performance trends. */
export function studentTrends(rows: ScoredAttempt[], recentCount = 5): StudentTrend[] {
  const graded = rows.filter((r) => r.gradingStatus === "graded" && r.percentage !== null && r.submittedAt);
  const byStudent = new Map<string, ScoredAttempt[]>();
  for (const r of graded) (byStudent.get(r.studentId) ?? byStudent.set(r.studentId, []).get(r.studentId)!).push(r);
  return [...byStudent.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => a.submittedAt!.localeCompare(b.submittedAt!));
      const pcts = sorted.map((r) => r.percentage!);
      const recent = pcts.slice(-recentCount);
      return {
        studentId: list[0].studentId,
        studentName: list[0].studentName,
        attempts: pcts.length,
        average: round1(pcts.reduce((a, b) => a + b, 0) / pcts.length),
        recent,
        change: recent.length >= 2 ? round1(recent[recent.length - 1] - recent[0]) : null,
      };
    })
    .sort((a, b) => b.average - a.average);
}
