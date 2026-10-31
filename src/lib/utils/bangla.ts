/** Small helpers for Bangla exam content. */

const BENGALI = /[ঀ-৿]/;
const BN_LETTERS = ["ক", "খ", "গ", "ঘ", "ঙ", "চ", "ছ", "জ", "ঝ", "ঞ"];

/** True when the text contains Bengali script. */
export function hasBengali(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => Boolean(t && BENGALI.test(t)));
}

/** MCQ option label: A, B, C… for English questions, ক, খ, গ… for Bangla ones (as on board papers). */
export function optionLabel(index: number, bangla: boolean): string {
  return bangla ? (BN_LETTERS[index] ?? String(index + 1)) : String.fromCharCode(65 + index);
}

/** Index of a Bangla option letter (ক → 0), or -1. */
export function banglaLetterIndex(letter: string): number {
  return BN_LETTERS.indexOf(letter);
}

/** Converts Bengali digits (০–৯) to ASCII digits. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}
