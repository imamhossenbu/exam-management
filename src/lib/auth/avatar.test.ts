import { describe, expect, it } from "vitest";
import { MAX_AVATAR_BYTES, isBase64DataUrl, isLegacyDiskAvatar, parseAvatarDataUrl } from "./avatar";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("isBase64DataUrl", () => {
  it("returns true for data:image/ URLs", () => {
    expect(isBase64DataUrl("data:image/webp;base64,UklGRnoAAABXRUJQVlA4")).toBe(true);
    expect(isBase64DataUrl(PNG)).toBe(true);
  });

  it("returns false for stored URLs, including long Storage URLs", () => {
    expect(isBase64DataUrl("/avatars/user-123.webp")).toBe(false);
    expect(isBase64DataUrl(`https://x.supabase.co/storage/v1/object/public/avatars/${"a".repeat(600)}.webp`)).toBe(false);
  });

  it("returns false for empty or null strings", () => {
    expect(isBase64DataUrl("")).toBe(false);
    expect(isBase64DataUrl(null)).toBe(false);
    expect(isBase64DataUrl(undefined)).toBe(false);
  });
});

describe("parseAvatarDataUrl", () => {
  it("accepts PNG/JPEG/WebP and picks the extension", () => {
    expect(parseAvatarDataUrl(PNG)).toMatchObject({ mime: "image/png", ext: "png" });
    expect(parseAvatarDataUrl(PNG.replace("image/png", "image/webp"))?.ext).toBe("webp");
  });

  it("rejects SVG, non-images and oversized files", () => {
    expect(parseAvatarDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(parseAvatarDataUrl("data:text/html;base64,PGgxPg==")).toBeNull();
    const big = "data:image/png;base64," + Buffer.alloc(MAX_AVATAR_BYTES + 1).toString("base64");
    expect(parseAvatarDataUrl(big)).toBeNull();
  });
});

describe("isLegacyDiskAvatar", () => {
  it("flags the old on-disk paths that never displayed", () => {
    expect(isLegacyDiskAvatar("/avatars/abc.webp")).toBe(true);
    expect(isLegacyDiskAvatar("https://x.supabase.co/storage/v1/object/public/avatars/a/1.webp")).toBe(false);
  });
});
