/**
 * Heuristic splitter that turns extracted/OCR text into DRAFT questions.
 * It never guesses silently: anything it can't detect is left empty for the
 * teacher to fill in, and every draft must be reviewed before it is saved.
 */
export type DraftQuestion = {
  type: "mcq" | "cq";
  body: string;
  options: string[];
  /** Index suggested by an "Answer: b" line in the source; still requires confirmation. */
  suggestedCorrectIndex: number;
  marks: number | null;
};

const QUESTION_START = /^\s*(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,3})\s*[.)\]:]\s*(\S.*)?$/i;
const OPTION_LINE = /^\s*[([]?([a-hA-H])[)\].:]\s+(\S.*)$/;
const INLINE_OPTIONS = /[([]([a-hA-H])[)\]]\s*/g;
const ANSWER_LINE = /^\s*(?:ans(?:wer)?|correct(?:\s+answer)?)\s*[:.\-–]\s*[([]?([a-hA-H])\b[)\]]?/i;
const MARKS = /[[(]\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)?\s*[)\]]\s*$/i;

function splitInlineOptions(line: string): { stem: string; options: string[] } | null {
  const matches = [...line.matchAll(INLINE_OPTIONS)];
  if (matches.length < 2) return null;
  const letters = matches.map((m) => m[1].toLowerCase());
  if (letters[0] !== "a" || letters[1] !== "b") return null;
  const stem = line.slice(0, matches[0].index).trim();
  const options = matches.map((m, i) => line.slice(m.index! + m[0].length, matches[i + 1]?.index ?? line.length).trim());
  return { stem, options };
}

function finalize(lines: string[]): DraftQuestion | null {
  let bodyLines: string[] = [];
  const options: string[] = [];
  let suggested = -1;
  let marks: number | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const answer = ANSWER_LINE.exec(line);
    if (answer) {
      suggested = answer[1].toLowerCase().charCodeAt(0) - 97;
      continue;
    }
    const option = OPTION_LINE.exec(line);
    if (option && (options.length > 0 || option[1].toLowerCase() === "a")) {
      const inline = splitInlineOptions(line);
      if (inline && inline.stem === "") options.push(...inline.options);
      else options.push(option[2].trim());
      continue;
    }
    const inline = splitInlineOptions(line);
    if (inline && options.length === 0) {
      if (inline.stem) bodyLines.push(inline.stem);
      options.push(...inline.options);
      continue;
    }
    if (options.length > 0) {
      options[options.length - 1] = `${options[options.length - 1]} ${line}`.trim();
    } else {
      bodyLines.push(line);
    }
  }

  let body = bodyLines.join("\n").trim();
  const marksMatch = MARKS.exec(body);
  if (marksMatch) {
    marks = Number(marksMatch[1]);
    body = body.slice(0, marksMatch.index).trim();
  }
  if (!body && options.length === 0) return null;
  bodyLines = [];
  const isMcq = options.length >= 2;
  return {
    type: isMcq ? "mcq" : "cq",
    body,
    options: isMcq ? options.filter(Boolean) : [],
    suggestedCorrectIndex: isMcq && suggested >= 0 && suggested < options.length ? suggested : -1,
    marks,
  };
}

export function parseQuestions(text: string): DraftQuestion[] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/ /g, " ").split("\n");
  const blocks: string[][] = [];
  let current: string[] | null = null;
  let expected = 1;

  for (const line of lines) {
    const m = QUESTION_START.exec(line);
    // Accept the next sequential number (or a restart at 1) as a new question.
    if (m && (Number(m[1]) === expected || Number(m[1]) === 1)) {
      if (current) blocks.push(current);
      current = [m[2] ?? ""];
      expected = Number(m[1]) + 1;
    } else if (current) {
      current.push(line);
    }
  }
  if (current) blocks.push(current);

  return blocks.map(finalize).filter((q): q is DraftQuestion => q !== null);
}
