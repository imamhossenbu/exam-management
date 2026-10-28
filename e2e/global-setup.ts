import { mkdirSync, writeFileSync } from "node:fs";
import { cleanupE2EData, createConfirmedStudent } from "./db";

export const STATE_FILE = ".tmp/e2e-state.json";

export default function globalSetup() {
  if (!process.env.E2E_TEACHER_EMAIL || !process.env.E2E_TEACHER_PASSWORD || process.env.E2E_TEACHER_PASSWORD.startsWith("PASTE_")) {
    throw new Error("Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD in .env.e2e.local (see .env.e2e.example).");
  }
  cleanupE2EData(); // leftovers from an interrupted run
  const students = { alice: createConfirmedStudent("Alice Test"), bob: createConfirmedStudent("Bob Test") };
  mkdirSync(".tmp", { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ students, runId: Date.now().toString(36) }), { mode: 0o600 });
}
