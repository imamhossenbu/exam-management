import { createHash, randomInt } from "node:crypto";

// Unambiguous alphabet (no 0/O, 1/I/L). 31 symbols → ~4.95 bits each; 12 chars ≈ 59 bits.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Cryptographically random, human-friendly code such as "K7QM-2XRP-9TDA". */
export function generateInviteCode(): string {
  let raw = "";
  for (let i = 0; i < 12; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Must match the hashing in redeem_course_invite(): sha256(hex) of the normalized code. */
export function hashInviteCode(code: string): string {
  return createHash("sha256").update(normalizeInviteCode(code), "utf8").digest("hex");
}

export function inviteCodeHint(code: string): string {
  return normalizeInviteCode(code).slice(-4);
}
