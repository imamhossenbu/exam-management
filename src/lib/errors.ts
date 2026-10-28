/** Friendly messages for machine-readable error codes raised by the database. */
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "Your session has expired. Please sign in again.",
  FORBIDDEN: "You don't have permission to do that.",
  ROLE_CHANGE_FORBIDDEN: "Roles can't be changed from the app.",
  INVALID_TIMEZONE: "That timezone isn't recognised.",
  COURSE_NOT_FOUND: "Course not found.",
  STUDENT_NOT_FOUND: "No student account uses that email. Ask the student to sign up first.",
  EXAM_NOT_FOUND: "Exam not found.",
  EXAM_LOCKED: "This exam is published, so its questions can't be changed. Duplicate it to make a revised version.",
  EXAM_SETTINGS_LOCKED: "Scoring settings can't change once the exam is published.",
  EXAM_NOT_DELETABLE: "Only draft exams can be deleted. Archive it instead.",
  EXAM_NOT_DRAFT: "Only draft exams can be published.",
  EXAM_NOT_PUBLISHED: "The exam isn't published.",
  EXAM_NOT_ARCHIVED: "The exam isn't archived.",
  EXAM_HAS_ATTEMPTS: "Students have already started this exam, so it can't be unpublished.",
  EXAM_STILL_OPEN: "Close the exam before archiving it.",
  EXAM_INVALID: "The exam isn't ready to publish.",
  EXAM_NOT_AVAILABLE: "This exam isn't available.",
  EXAM_NOT_STARTED: "This exam hasn't started yet.",
  EXAM_ENDED: "This exam has ended.",
  ATTEMPT_LIMIT_REACHED: "You've used all your attempts for this exam.",
  ATTEMPT_NOT_FOUND: "Attempt not found.",
  ATTEMPT_FINALIZED: "This attempt has already been submitted.",
  ATTEMPT_NOT_SUBMITTED: "The attempt hasn't been submitted yet.",
  DEADLINE_PASSED: "The deadline has passed.",
  QUESTION_NOT_FOUND: "Question not found.",
  INVALID_OPTION: "That option doesn't belong to this question.",
  INVALID_ANSWER: "That answer isn't valid.",
  INVALID_ORDER: "The question order is out of date. Refresh and try again.",
  UPLOAD_CLOSED: "Uploads are closed for this attempt.",
  INVALID_STORAGE_PATH: "Invalid file location.",
  TOO_MANY_FILES: "You've reached the upload limit for this attempt.",
  FILE_NOT_FOUND: "File not found.",
  INVALID_MARKS: "Marks are out of range.",
  PART_REQUIRED: "Grade each sub-question separately.",
  GRADING_INCOMPLETE: "Some questions still need marks.",
  RESUBMISSION_NOT_ALLOWED: "This exam doesn't allow returning work for correction.",
  INVALID_DEADLINE: "Choose a deadline in the future.",
  CHAPTER_NOT_IN_COURSE: "That chapter belongs to a different course.",
  SUBJECT_NOT_IN_COURSE: "That subject belongs to a different course.",
  NOTE_NOT_FOUND: "Note not found.",
};

type DbError = { code?: string; message?: string; details?: string | null } | null | undefined;

/**
 * Converts a Supabase/Postgres error into a safe, user-facing message.
 * Raw SQL text, constraint names and stack traces are never returned.
 */
export function toUserMessage(error: DbError, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  const code = error.message?.trim();
  if (code && MESSAGES[code]) {
    // Known codes may carry a safe, human-written detail (e.g. validation list).
    if ((code === "EXAM_INVALID" || code === "GRADING_INCOMPLETE" || code === "INVALID_MARKS") && error.details) {
      return `${MESSAGES[code]} ${error.details}`;
    }
    return MESSAGES[code];
  }
  switch (error.code) {
    case "42501":
      return MESSAGES.FORBIDDEN;
    case "23505":
      return "That already exists.";
    case "23503":
      return "This item is still in use and can't be removed.";
    case "23514":
    case "22023":
    case "22P02":
      return "Some values are invalid. Check the form and try again.";
    case "PGRST116":
      return "Not found.";
    case "PGRST301":
    case "28000":
      return MESSAGES.NOT_AUTHENTICATED;
    default:
      return fallback;
  }
}

export function errorCode(error: DbError): string | undefined {
  const code = error?.message?.trim();
  return code && MESSAGES[code] ? code : undefined;
}
