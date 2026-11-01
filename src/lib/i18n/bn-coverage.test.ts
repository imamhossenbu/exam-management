import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bn } from "./bn";

/**
 * Every literal passed to t(), tNow() or <T> must have a Bangla translation, so new UI text
 * can't silently ship in English. (Text passed as props to shared components is translated
 * at runtime too, but isn't checked here.)
 */
const SRC = path.resolve(__dirname, "../..");
const SKIP = [/\/lib\/email\//, /\/app\/\[lang\]\/setup\//, /\.test\.tsx?$/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(p) && !SKIP.some((r) => r.test(p)) ? [p] : [];
  });
}

const unescape = (s: string) => JSON.parse(`"${s}"`) as string;
const collapse = (s: string) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function keysIn(source: string): string[] {
  const keys: string[] = [];
  for (const m of source.matchAll(/\b(?:t|tNow|trChildren)\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.push(unescape(m[1]));
  for (const m of source.matchAll(/\b(?:t|tNow)\(\s*\w+\s*\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) keys.push(unescape(m[1]), unescape(m[2]));
  for (const m of source.matchAll(/<T(?:\s+vars=\{\{[^}]*\}\})?>\s*\{\s*"((?:[^"\\]|\\.)*)"\s*\}\s*<\/T>/g)) keys.push(unescape(m[1]));
  for (const m of source.matchAll(/<T>([^<{}]+)<\/T>/g)) keys.push(collapse(m[1]));
  return keys.filter((k) => /[A-Za-z]{2}/.test(k));
}

describe("Bangla dictionary", () => {
  it("translates every literal UI string", () => {
    const missing = new Set<string>();
    for (const file of files(SRC)) for (const key of keysIn(readFileSync(file, "utf8"))) if (!(key in bn)) missing.add(`${key}  (${path.relative(SRC, file)})`);
    expect([...missing].sort()).toEqual([]);
  });
});
