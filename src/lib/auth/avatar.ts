import fs from "node:fs/promises";
import path from "node:path";

const AVATARS_DIR = path.join(process.cwd(), "public", "avatars");

/** Checks whether a string is a bloated base64 data URL */
export function isBase64DataUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("data:image/") || value.startsWith("data:application/") || value.length > 500;
}

/**
 * Saves a base64 avatar image to the public/avatars/ directory
 * and returns the short static URL with cache-busting timestamp.
 */
export async function saveAvatarFromBase64(userId: string, dataUrl: string): Promise<string> {
  await fs.mkdir(AVATARS_DIR, { recursive: true });
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const filePath = path.join(AVATARS_DIR, `${userId}.webp`);
  await fs.writeFile(filePath, buffer);
  return `/avatars/${userId}.webp`;
}

/** Deletes the avatar file from disk if it exists. */
export async function deleteAvatar(userId: string): Promise<void> {
  try {
    const filePath = path.join(AVATARS_DIR, `${userId}.webp`);
    await fs.unlink(filePath);
  } catch {
    // Ignore file not found or deletion errors
  }
}
