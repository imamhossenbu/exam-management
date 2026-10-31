import { banglaLetterIndex, toAsciiDigits } from "@/lib/utils/bangla";

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

// English and Bangla papers: "1." / "১." / "১।" / "প্রশ্ন ১:", options "a)" / "(ক)", answers "Answer: b" / "উত্তর: খ".
const BN_OPT = "কখগঘঙচছজ";
const OPT = `(?:[a-hA-H](?![a-zA-Z])|[${BN_OPT}](?![\u0980-\u09FF]))`;
const QUESTION_START = /^\s*(?:Q(?:uestion)?\s*\.?\s*|প্রশ্ন\s*(?:নং|নম্বর)?\s*[:.]?\s*)?([0-9০-৯]{1,3})\s*[.)\]:।]\s*(\S.*)?$/i;
// "ক)ঢাকা" needs no space after a bracket; "a. x" / "ক। x" need one (so "e.g." isn't an option).
const OPTION_LINE = new RegExp(`^\\s*[([]?(${OPT})(?:\\s*[)\\]]\\s*|[.:।]\\s+)(\\S.*)$`);
const INLINE_OPTIONS = new RegExp(`[([](${OPT})[)\\]]\\s*`, "g");
const ANSWER_LINE = new RegExp(`^\\s*(?:ans(?:wer)?|correct(?:\\s+answer)?|সঠিক\\s+উত্তর|উত্তর|উঃ)\\s*[:.\\-–ঃ]?\\s*[([]?(${OPT})[)\\]]?`, "i");
const MARKS = /[[(]\s*([0-9০-৯]+(?:\.[0-9০-৯]+)?)\s*(?:marks?|m|নম্বর|নং)?\s*[)\]]\s*$/i;

/** a → 0, ক → 0. */
function letterIndex(letter: string): number {
  return /[a-h]/i.test(letter) ? letter.toLowerCase().charCodeAt(0) - 97 : banglaLetterIndex(letter);
}

function splitInlineOptions(line: string): { stem: string; options: string[] } | null {
  const matches = [...line.matchAll(INLINE_OPTIONS)];
  if (matches.length < 2) return null;
  const letters = matches.map((m) => letterIndex(m[1]));
  if (letters[0] !== 0 || letters[1] !== 1) return null;
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
      suggested = letterIndex(answer[1]);
      continue;
    }
    const option = OPTION_LINE.exec(line);
    if (option && (options.length > 0 || letterIndex(option[1]) === 0)) {
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
    marks = Number(toAsciiDigits(marksMatch[1]));
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
    const n = m ? Number(toAsciiDigits(m[1])) : NaN;
    if (m && (n === expected || n === 1)) {
      if (current) blocks.push(current);
      current = [m[2] ?? ""];
      expected = n + 1;
    } else if (current) {
      current.push(line);
    }
  }
  if (current) blocks.push(current);

  return blocks.map(finalize).filter((q): q is DraftQuestion => q !== null);
}
