/**
 * Reusable, responsive base HTML email layout for ExamDesk.
 * Fully compatible with Gmail, Outlook, Apple Mail, and mobile clients.
 */

export type BaseEmailOptions = {
  previewText?: string;
  badge?: string;
  badgeIcon?: string;
  title: string;
  subtitle?: string;
  contentHtml: string;
  footerNote?: string;
};

export function renderBaseEmailLayout({
  previewText = "ExamDesk Notification",
  badge = "EXAMDESK",
  badgeIcon = "🎓",
  title,
  subtitle,
  contentHtml,
  footerNote,
}: BaseEmailOptions): string {
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${escapeHtml(title)} - ExamDesk</title>
  <style>
    /* Reset */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 0 !important;
      }
      .email-content {
        padding: 28px 20px !important;
      }
      .otp-digit {
        font-size: 28px !important;
        letter-spacing: 6px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc;">
  <!-- Hidden Preview Text -->
  <div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; color: transparent;">
    ${escapeHtml(previewText)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;
  </div>

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; width: 100%;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <!-- Container -->
        <table role="presentation" class="email-container" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.06), 0 8px 10px -6px rgba(15, 23, 42, 0.04); overflow: hidden;">
          
          <!-- Top Accent Bar -->
          <tr>
            <td height="5" style="height: 5px; background: linear-gradient(90deg, #4f46e5, #7c3aed, #ec4899); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Header Section -->
          <tr>
            <td style="padding: 32px 36px 20px; text-align: center; border-bottom: 1px solid #f1f5f9; background: linear-gradient(180deg, #fbfbfe 0%, #ffffff 100%);">
              <div style="display: inline-flex; align-items: center; justify-content: center; padding: 6px 14px; border-radius: 9999px; background: #eef2ff; border: 1px solid #e0e7ff; margin-bottom: 14px;">
                <span style="font-size: 14px; margin-right: 6px;">${badgeIcon}</span>
                <span style="font-size: 12px; font-weight: 700; color: #4338ca; letter-spacing: 0.8px; text-transform: uppercase;">${escapeHtml(badge)}</span>
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.4px; line-height: 1.3;">
                ${escapeHtml(title)}
              </h1>
              ${
                subtitle
                  ? `<p style="margin: 8px 0 0; font-size: 14px; color: #64748b; line-height: 1.5;">${escapeHtml(subtitle)}</p>`
                  : ""
              }
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td class="email-content" style="padding: 32px 36px 36px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              ${
                footerNote
                  ? `<p style="margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: #64748b;">${footerNote}</p>`
                  : ""
              }
              <p style="margin: 0; font-size: 11px; line-height: 1.6; color: #94a3b8;">
                🔒 Secured by <strong>ExamDesk</strong> · Online Examination & Grading Platform<br>
                © ${year} ExamDesk. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
