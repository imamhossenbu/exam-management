import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/seo";
import { BrandMark } from "@/components/shared/brand-mark";

export const alt = `${SITE_NAME} — online exams, grading and results in one place`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          color: "#fff",
          background: "radial-gradient(circle at 15% 10%, #4338ca 0%, transparent 45%), radial-gradient(circle at 90% 90%, #a21caf 0%, transparent 45%), #0f0d1f",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <BrandMark size={88} radius={22} />
          <div style={{ fontSize: 48, fontWeight: 700 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>Exams, grading and notes in one calm place.</div>
          <div style={{ fontSize: 32, color: "rgba(255,255,255,0.72)" }}>Timed MCQ and written exams · automatic grading · handwritten answer review</div>
        </div>
      </div>
    ),
    size,
  );
}
