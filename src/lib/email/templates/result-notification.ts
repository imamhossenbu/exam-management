import { renderBaseEmailLayout } from "./base";

export type ResultNotificationEmailOptions = {
  fullName: string;
  examTitle: string;
  courseName: string;
  score: number;
  totalMarks: number;
  percentage?: number;
  resultUrl: string;
};

export function renderResultNotificationEmail({
  fullName,
  examTitle,
  courseName,
  score,
  totalMarks,
  percentage,
  resultUrl,
}: ResultNotificationEmailOptions): { subject: string; html: string; text: string } {
  const calcPercent = percentage ?? Math.round((score / (totalMarks || 1)) * 100);
  const subject = `Results Released: ${examTitle} (${courseName})`;

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.6;">
      Hello <strong>${escapeHtml(fullName)}</strong>,
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
      The results for <strong>${escapeHtml(examTitle)}</strong> in <strong>${escapeHtml(courseName)}</strong> have been published.
    </p>

    <!-- Score Card -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 28px;">
      <tr>
        <td align="center" style="background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%); border: 1px solid #bae6fd; border-radius: 16px; padding: 28px 24px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #0284c7; margin-bottom: 6px;">
            Your Final Score
          </div>
          <div style="font-size: 42px; font-weight: 900; color: #0369a1; letter-spacing: -1px; margin: 4px 0;">
            ${score} <span style="font-size: 20px; font-weight: 600; color: #64748b;">/ ${totalMarks}</span>
          </div>
          <div style="display: inline-block; padding: 4px 12px; border-radius: 9999px; background: #ffffff; border: 1px solid #7dd3fc; font-size: 13px; font-weight: 700; color: #0284c7; margin-top: 8px;">
            ${calcPercent}% Overall
          </div>
        </td>
      </tr>
    </table>

    <!-- Call to action button -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(resultUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
            View Detailed Solutions &amp; Feedback &rarr;
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 16px;">
      You can review correct answer keys, detailed explanations, and teacher feedback directly inside your student portal.
    </p>
  `;

  const html = renderBaseEmailLayout({
    previewText: `Your results for ${examTitle} are now available: ${score}/${totalMarks} (${calcPercent}%).`,
    badge: "Results Available",
    badgeIcon: "📊",
    title: "Exam Results Published",
    subtitle: examTitle,
    contentHtml,
    footerNote: "Detailed question analysis and rubrics are available online.",
  });

  const text = `Hello ${fullName},\n\nYour results for "${examTitle}" (${courseName}) have been released.\n\nScore: ${score} / ${totalMarks} (${calcPercent}%)\n\nView complete solutions & teacher feedback:\n${resultUrl}\n\n- The ExamDesk Team`;

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
