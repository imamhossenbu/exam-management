import { renderBaseEmailLayout } from "./base";

export type CourseInviteEmailOptions = {
  fullName?: string;
  courseName: string;
  teacherName?: string;
  inviteCode: string;
  joinUrl: string;
};

export function renderCourseInviteEmail({
  fullName,
  courseName,
  teacherName,
  inviteCode,
  joinUrl,
}: CourseInviteEmailOptions): { subject: string; html: string; text: string } {
  const greeting = fullName ? `Hello <strong>${escapeHtml(fullName)}</strong>,` : "Hello,";
  const teacherText = teacherName ? ` by <strong>${escapeHtml(teacherName)}</strong>` : "";
  const subject = `You're invited to join ${courseName} on ExamDesk`;

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.6;">
      ${greeting}
    </p>
    <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
      You have been invited to join the course <strong>${escapeHtml(courseName)}</strong>${teacherText} on <strong>ExamDesk</strong>.
    </p>

    <!-- Invitation Code Box -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center" style="background-color: #f5f3ff; border: 2px dashed #818cf8; border-radius: 16px; padding: 24px 20px;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #4f46e5; margin-bottom: 8px;">
            Course Invitation Code
          </div>
          <div style="font-family: 'SF Mono', Monaco, Menlo, Consolas, 'Courier New', monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #312e81; padding-left: 6px; margin: 4px 0 8px;">
            ${escapeHtml(inviteCode)}
          </div>
          <div style="font-size: 12px; color: #64748b;">
            Enter this code on your dashboard or click below to join instantly
          </div>
        </td>
      </tr>
    </table>

    <!-- Call to action button -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(joinUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
            Join Course Now &rarr;
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 16px;">
      Once enrolled, you'll be able to access all exams, quizzes, and class study notes for this course.
    </p>
  `;

  const html = renderBaseEmailLayout({
    previewText: `You've been invited to join ${courseName} on ExamDesk. Code: ${inviteCode}`,
    badge: "Course Invite",
    badgeIcon: "🎒",
    title: "Join Your Course",
    subtitle: courseName,
    contentHtml,
    footerNote: "Only join courses from teachers you recognize.",
  });

  const text = `Hello ${fullName || "there"},\n\nYou have been invited to join "${courseName}" on ExamDesk.\n\nInvitation Code: ${inviteCode}\n\nJoin directly:\n${joinUrl}\n\n- The ExamDesk Team`;

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
