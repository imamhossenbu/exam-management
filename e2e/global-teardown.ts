import { rmSync } from "node:fs";
import { cleanupE2EData, countE2EData } from "./db";
import { STATE_FILE } from "./global-setup";

export default function globalTeardown() {
  if (process.env.E2E_KEEP_DATA === "1") return;
  cleanupE2EData();
  rmSync(STATE_FILE, { force: true });
  const left = countE2EData();
  if (left.users || left.courses) throw new Error(`E2E cleanup left data behind: ${JSON.stringify(left)}`);
  console.log("E2E cleanup: all test users, courses and exams removed.");
}
