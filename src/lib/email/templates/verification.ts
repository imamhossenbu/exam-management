import { renderBaseEmailLayout } from "./base";

export type VerificationEmailOptions = {
  code: string;
  fullName?: string;
  linkUrl?: string;
  expiresInMinutes?: number;
};

export function renderVerificationEmail({
  code,
  fullName,
  linkUrl,
  expiresInMinutes = 15,
}: VerificationEmailOptions): { subject: string; html: string; text: string } {
  const greeting = fullName ? `Hello <strong>${escapeHtml(fullName)}</strong>,` : "Hello,";
  const subject = `${code} is your ExamDesk verification code`;

  const contentHtml = `
    <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.6;">
      ${greeting}
    </p>
    <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
      Thank you for signing up for <strong>ExamDesk</strong>. Please use the following 6-digit security code to verify your email address:
    </p>

    <!-- 6-digit OTP Display Box -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center" style="background-color: #f5f3ff; border: 2px dashed #818cf8; border-radius: 16px; padding: 26px 20px;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #4f46e5; margin-bottom: 8px;">
            Your 6-Digit Verification Code
          </div>
          <div class="otp-digit" style="font-family: 'SF Mono', Monaco, Menlo, Consolas, 'Courier New', monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #312e81; padding-left: 10px; margin: 4px 0 8px;">
            ${code}
          </div>
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">
            ⏱️ Expires in <strong>${expiresInMinutes} minutes</strong>
          </div>
        </td>
      </tr>
    </table>

    ${
      linkUrl
        ? `
    <!-- One-click button alternative -->
    <div style="text-align: center; margin: 28px 0 24px;">
      <a href="${escapeHtml(linkUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
        Verify with one click &rarr;
      </a>
    </div>
    `
        : ""
    }

    <p style="margin: 24px 0 0; font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 20px;">
      If you did not request this verification code, please ignore this email or contact support. Never share this code with anyone.
    </p>
  `;

  const html = renderBaseEmailLayout({
    previewText: `Your ExamDesk verification code is ${code}. Valid for ${expiresInMinutes} minutes.`,
    badge: "Account Verification",
    badgeIcon: "🛡️",
    title: "Verify your email address",
    subtitle: "Complete your account registration on ExamDesk",
    contentHtml,
    footerNote: "This security code was sent automatically to verify your email.",
  });

  const text = `Hello ${fullName || "there"},\n\nYour ExamDesk 6-digit verification code is: ${code}\n\nThis code will expire in ${expiresInMinutes} minutes.\n\nIf you did not request this, please ignore this email.\n\n- The ExamDesk Team`;

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
