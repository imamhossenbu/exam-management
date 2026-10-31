import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * Profile photos live in the public "avatars" Supabase Storage bucket at
 * {userId}/{timestamp}.{ext}. Each upload gets a new name, so browsers and CDNs
 * never show a stale cached photo, and older files are removed.
 *
 * (They used to be written to public/avatars on the web server. Next.js only
 * serves public/ files that existed at build time, so those never displayed.)
 */
const BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 512 * 1024;
const TYPES: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

/** Checks whether a string is an inline base64 image (what the profile form sends). */
export function isBase64DataUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^data:image\/[a-z+.-]+;base64,/i.test(value));
}

/** Old avatar paths on the web server's disk; they never resolve, so treat them as "no photo". */
export function isLegacyDiskAvatar(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith("/avatars/"));
}

/** Decodes and validates a data URL. Returns null for unsupported or oversized images. */
export function parseAvatarDataUrl(dataUrl: string): { mime: string; ext: string; bytes: Buffer } | null {
  const m = dataUrl.match(/^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = TYPES[mime];
  if (!ext) return null;
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) return null;
  return { mime, ext, bytes };
}

async function removeAll(supabase: ServerSupabase, userId: string, keep?: string) {
  const { data } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
  const stale = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
}

/** Uploads the photo and returns its public URL. Throws on invalid input or storage errors. */
export async function saveAvatarFromBase64(supabase: ServerSupabase, userId: string, dataUrl: string): Promise<string> {
  const parsed = parseAvatarDataUrl(dataUrl);
  if (!parsed) throw new Error("INVALID_AVATAR");
  const path = `${userId}/${Date.now()}.${parsed.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, parsed.bytes, {
    contentType: parsed.mime,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  await removeAll(supabase, userId, path).catch(() => undefined);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Removes every stored photo of the user. Never throws. */
export async function deleteAvatar(supabase: ServerSupabase, userId: string): Promise<void> {
  await removeAll(supabase, userId).catch(() => undefined);
}
