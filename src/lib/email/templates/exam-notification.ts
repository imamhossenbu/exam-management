import { renderBaseEmailLayout } from "./base";

export type ExamNotificationEmailOptions = {
  fullName: string;
  examTitle: string;
  courseName: string;
  startsAt?: string;
  durationMinutes: number;
  totalMarks?: number;
  examUrl: string;
};

export function renderExamNotificationEmail({
  fullName,
  examTitle,
  courseName,
  startsAt,
  durationMinutes,
  totalMarks,
  examUrl,
}: ExamNotificationEmailOptions): { subject: string; html: string; text: string } {
  const subject = `Upcoming Exam: ${examTitle} (${courseName})`;

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.6;">
      Hello <strong>${escapeHtml(fullName)}</strong>,
    </p>
    <p style="margin: 0 0 20px; font-size: 15px; color: #475569; line-height: 1.6;">
      A new exam has been scheduled in your course <strong>${escapeHtml(courseName)}</strong>. Here are the key details:
    </p>

    <!-- Exam Details Card -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; margin: 0 0 28px; overflow: hidden;">
      <tr>
        <td style="padding: 20px 24px; border-bottom: 1px solid #f1f5f9;">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Exam Title</div>
          <div style="font-size: 17px; font-weight: 800; color: #0f172a; margin-top: 4px;">${escapeHtml(examTitle)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 24px;">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              ${
                startsAt
                  ? `
                <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 50%;">
                  📅 <strong>Starts:</strong> ${escapeHtml(startsAt)}
                </td>
              `
                  : ""
              }
              <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 50%;">
                ⏱️ <strong>Duration:</strong> ${durationMinutes} minutes
              </td>
            </tr>
            ${
              totalMarks !== undefined
                ? `
            <tr>
              <td colspan="2" style="padding: 6px 0; font-size: 13px; color: #64748b;">
                🎯 <strong>Total Marks:</strong> ${totalMarks}
              </td>
            </tr>
            `
                : ""
            }
          </table>
        </td>
      </tr>
    </table>

    <!-- Call to action button -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(examUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
            Go to Exam Lobby &rarr;
          </a>
        </td>
      </tr>
    </table>

    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 8px; margin: 0 0 20px;">
      <p style="margin: 0; font-size: 12px; color: #1e40af; line-height: 1.5;">
        💡 <strong>Exam Tips:</strong> Make sure you have a stable internet connection before starting. Your progress is automatically saved as you answer.
      </p>
    </div>
  `;

  const html = renderBaseEmailLayout({
    previewText: `Upcoming Exam: ${examTitle} in ${courseName}. Duration: ${durationMinutes} mins.`,
    badge: "Exam Alert",
    badgeIcon: "📝",
    title: "New Exam Scheduled",
    subtitle: courseName,
    contentHtml,
    footerNote: "Good luck with your exam preparation!",
  });

  const text = `Hello ${fullName},\n\nA new exam "${examTitle}" has been scheduled in ${courseName}.\n\nDuration: ${durationMinutes} minutes\n${startsAt ? `Start Time: ${startsAt}\n` : ""}\nView exam lobby:\n${examUrl}\n\n- The ExamDesk Team`;

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
