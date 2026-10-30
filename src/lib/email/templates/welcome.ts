import { renderBaseEmailLayout } from "./base";

export type WelcomeEmailOptions = {
  fullName: string;
  role?: "student" | "teacher";
  dashboardUrl?: string;
};

export function renderWelcomeEmail({
  fullName,
  role = "student",
  dashboardUrl,
}: WelcomeEmailOptions): { subject: string; html: string; text: string } {
  const siteUrl = (process.env.NEXT_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const targetUrl = dashboardUrl || (siteUrl ? `${siteUrl}/${role}` : `/${role}`);
  const subject = `Welcome to ExamDesk, ${fullName}! 🚀`;

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.6;">
      Hello <strong>${escapeHtml(fullName)}</strong>,
    </p>
    <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
      Welcome to <strong>ExamDesk</strong>! Your account has been verified and is ready to go. You now have access to a clean, focused environment for exams, instant scoring, and study materials.
    </p>

    <!-- Quick Features List -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px 24px; margin: 0 0 28px;">
      <div style="font-size: 13px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
        ${role === "teacher" ? "Teacher Capabilities" : "What you can do:"}
      </div>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #475569; line-height: 1.8;">
        ${
          role === "teacher"
            ? `
          <li>Create courses and invite students with secret invitation codes.</li>
          <li>Design exams with MCQ & CQ questions, rich text, and question banks.</li>
          <li>Grade submissions with instant rubric evaluation and annotations.</li>
          <li>Monitor attempts in real-time with comprehensive analytics.</li>
        `
            : `
          <li>Join your class courses using the invitation code from your teacher.</li>
          <li>Take timed online exams with instant auto-save and zero lag.</li>
          <li>Review published answer keys, explanations, and your detailed scores.</li>
          <li>Organize personal study notes and access class materials anytime.</li>
        `
        }
      </ul>
    </div>

    <!-- Go to Dashboard CTA -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(targetUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
            Go to your dashboard &rarr;
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 20px;">
      Need help? Reach out to your course instructor or visit the ExamDesk help resources.
    </p>
  `;

  const html = renderBaseEmailLayout({
    previewText: `Welcome to ExamDesk, ${fullName}! Your account is active and ready.`,
    badge: "Welcome",
    badgeIcon: "🎉",
    title: "Account confirmed successfully",
    subtitle: "We're thrilled to have you on ExamDesk",
    contentHtml,
    footerNote: "You are receiving this because you created an ExamDesk account.",
  });

  const text = `Welcome to ExamDesk, ${fullName}!\n\nYour account has been verified and is ready.\n\nOpen your dashboard to get started:\n${targetUrl}\n\n- The ExamDesk Team`;

  return { subject, html, text };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
