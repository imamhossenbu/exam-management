import { renderBaseEmailLayout } from "./base";

export type PasswordResetEmailOptions = {
  resetUrl: string;
  fullName?: string;
  expiresInMinutes?: number;
};

export function renderPasswordResetEmail({
  resetUrl,
  fullName,
  expiresInMinutes = 60,
}: PasswordResetEmailOptions): { subject: string; html: string; text: string } {
  const greeting = fullName ? `Hello <strong>${escapeHtml(fullName)}</strong>,` : "Hello,";
  const subject = "Reset your ExamDesk password";

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.6;">
      ${greeting}
    </p>
    <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
      We received a request to reset your password for your <strong>ExamDesk</strong> account. Click the button below to choose a new password:
    </p>

    <!-- Reset Password Button -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 28px;">
      <tr>
        <td align="center">
          <a href="${escapeHtml(resetUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
            Choose new password &rarr;
          </a>
        </td>
      </tr>
    </table>

    <!-- Direct Link Fallback -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin: 0 0 24px;">
      <p style="margin: 0 0 6px; font-size: 12px; color: #64748b; font-weight: 600;">
        Button not working? Copy and paste this URL into your browser:
      </p>
      <a href="${escapeHtml(resetUrl)}" target="_blank" style="font-size: 12px; color: #4f46e5; text-decoration: underline; word-break: break-all;">
        ${escapeHtml(resetUrl)}
      </a>
    </div>

    <p style="margin: 0 0 8px; font-size: 13px; color: #64748b; line-height: 1.5;">
      ⏱️ This link can only be used once and expires in <strong>${expiresInMinutes} minutes</strong>.
    </p>
    <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 16px;">
      If you did not request a password reset, you can safely ignore this email. Your account remains completely secure.
    </p>
  `;

  const html = renderBaseEmailLayout({
    previewText: "Reset your ExamDesk account password securely.",
    badge: "Security",
    badgeIcon: "🔑",
    title: "Reset your password",
    subtitle: "Choose a new secure password for your account",
    contentHtml,
    footerNote: "Never share your password reset link with anyone.",
  });

  const text = `Hello ${fullName || "there"},\n\nWe received a request to reset your password for your ExamDesk account.\n\nClick the link below to choose a new password:\n${resetUrl}\n\nThis link expires in ${expiresInMinutes} minutes.\n\nIf you did not request this, please ignore this email.\n\n- The ExamDesk Team`;

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
