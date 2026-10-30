"""Builds Supabase auth email templates (supabase/templates/*.html) from one layout.

Email clients ignore <style> blocks and modern CSS, so everything is inline and
table-based, with a solid-colour fallback behind the gradient. Run:
    python3 scripts/build-email-templates.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "supabase" / "templates"

LAYOUT = """<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f0f7;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f0f7;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <!-- Brand -->
        <tr>
          <td align="center" style="padding:0 0 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;border-radius:12px;background-color:#4f46e5;background-image:linear-gradient(135deg,#4f46e5,#7c3aed,#ec4899);font-size:22px;line-height:42px;box-shadow:0 6px 18px -4px rgba(79,70,229,0.45);">&#127891;</td>
                <td style="padding-left:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#18181b;">ExamDesk</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background-color:#ffffff;border-radius:24px;border:1px solid #e4e4e7;box-shadow:0 16px 40px -12px rgba(39,39,42,0.12);overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td height="6" style="height:6px;line-height:6px;font-size:0;background-color:#4f46e5;background-image:linear-gradient(90deg,#4f46e5,#7c3aed,#ec4899);border-radius:24px 24px 0 0;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:40px 44px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="54" height="54" align="center" valign="middle" style="width:54px;height:54px;border-radius:16px;background-color:#eff6ff;background-image:linear-gradient(135deg,#eff6ff,#f5f3ff);border:1px solid #e0e7ff;font-size:26px;line-height:54px;">{icon}</td>
                    </tr>
                  </table>
                  <h1 style="margin:22px 0 10px;font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.4px;color:#18181b;">{heading}</h1>
                  <p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#52525b;">{intro}</p>
                  
                  {otp_box}

                  <!-- Button -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;">
                    <tr>
                      <td align="center" style="border-radius:12px;background-color:#4f46e5;background-image:linear-gradient(135deg,#4f46e5,#7c3aed);box-shadow:0 8px 20px -4px rgba(79,70,229,0.45);">
                        <a href="{link}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">{cta} &rarr;</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:26px 0 0;font-size:13px;line-height:20px;color:#71717a;">{note}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 44px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafafa;border:1px solid #f4f4f5;border-radius:12px;">
                    <tr>
                      <td style="padding:14px 18px;font-size:12px;line-height:18px;color:#71717a;">
                        Direct button not opening? Copy and paste this URL into your browser:<br>
                        <a href="{link}" target="_blank" style="color:#4f46e5;text-decoration:underline;word-break:break-all;">{link}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td align="center" style="padding:28px 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;color:#a1a1aa;">
            &#128274; {security}<br>
            You received this email because of an action on your ExamDesk account.<br>
            &copy; ExamDesk &middot; Online Exam Management System
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""

SITE = "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}"

OTP_HTML = """
<!-- 6-digit OTP Box -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 24px;background-color:#f5f3ff;border:2px dashed #818cf8;border-radius:16px;text-align:center;">
  <tr>
    <td style="padding:22px 18px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#6366f1;margin-bottom:8px;">Your 6-Digit Verification Code</div>
      <div style="font-family:'Courier New',Courier,monospace;font-size:38px;font-weight:800;letter-spacing:14px;color:#3730a3;padding-left:14px;margin:4px 0;">{{ .Token }}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:8px;">Enter this code on the verification screen to activate your account. Valid for 60 minutes.</div>
    </td>
  </tr>
</table>
"""

TEMPLATES = {
    "confirmation": dict(
        title="Confirm your ExamDesk account",
        preheader="Your 6-digit verification code is {{ .Token }}",
        icon="&#9989;",
        heading="Verify your email address",
        intro="Welcome to ExamDesk! Use the 6-digit verification code below to activate your account for <strong style=\"color:#18181b;\">{{ .Email }}</strong>. You can also click the button to verify instantly.",
        otp_box=OTP_HTML,
        cta="Verify with one click",
        link=SITE + "&amp;type=email&amp;next=/student",
        note="This verification code and link expire in 60 minutes. If you did not create an ExamDesk account, you can safely ignore this email.",
        security="We'll never ask for your password or sensitive information by email.",
    ),
    "recovery": dict(
        title="Reset your ExamDesk password",
        preheader="Use this secure link to choose a new password.",
        icon="&#128273;",
        heading="Reset your password",
        intro="We received a request to reset the password for <strong style=\"color:#18181b;\">{{ .Email }}</strong>. Click the button below to choose a new one.",
        otp_box="",
        cta="Choose a new password",
        link=SITE + "&amp;type=recovery&amp;next=/reset-password",
        note="This link can be used once and expires soon. If you didn't ask to reset your password, ignore this email — your password won't change.",
        security="If you didn't request this, someone may have typed your email by mistake.",
    ),
    "magic_link": dict(
        title="Your ExamDesk sign-in link",
        preheader="Sign in to ExamDesk with one click.",
        icon="&#10024;",
        heading="Your sign-in link",
        intro="Click the button below to sign in to ExamDesk as <strong style=\"color:#18181b;\">{{ .Email }}</strong>.",
        otp_box="",
        cta="Sign in to ExamDesk",
        link=SITE + "&amp;type=magiclink&amp;next=/dashboard",
        note="This link can be used once and expires soon. If you didn't try to sign in, you can ignore this email.",
        security="Never forward this email — the link signs you in.",
    ),
    "email_change": dict(
        title="Confirm your new ExamDesk email",
        preheader="Confirm the change to your account email address.",
        icon="&#128231;",
        heading="Confirm your new email",
        intro="Please confirm that you want to change your ExamDesk email from <strong style=\"color:#18181b;\">{{ .Email }}</strong> to <strong style=\"color:#18181b;\">{{ .NewEmail }}</strong>.",
        otp_box="",
        cta="Confirm email change",
        link=SITE + "&amp;type=email_change&amp;next=/dashboard",
        note="If you didn't request this change, ignore this email and consider changing your password.",
        security="Your email won't change unless you confirm.",
    ),
    "invite": dict(
        title="You're invited to ExamDesk",
        preheader="Accept your invitation to ExamDesk.",
        icon="&#127881;",
        heading="You've been invited",
        intro="You've been invited to join ExamDesk, a private exam platform for your class. Accept the invitation to set up your account.",
        otp_box="",
        cta="Accept invitation",
        link=SITE + "&amp;type=invite&amp;next=/reset-password",
        note="This invitation link can be used once and expires soon.",
        security="Only accept invitations you were expecting.",
    ),
}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fields in TEMPLATES.items():
        (OUT / f"{name}.html").write_text(LAYOUT.format(**fields))
        print(f"wrote supabase/templates/{name}.html")
