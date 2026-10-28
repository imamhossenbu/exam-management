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
                <td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;border-radius:11px;background-color:#5b4be3;background-image:linear-gradient(135deg,#4f46e5,#a855f7);font-size:20px;line-height:40px;">&#127891;</td>
                <td style="padding-left:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.3px;color:#1c1b29;">ExamDesk</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background-color:#ffffff;border-radius:20px;border:1px solid #e6e4f0;box-shadow:0 12px 40px -12px rgba(40,30,90,0.18);overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td height="6" style="height:6px;line-height:6px;font-size:0;background-color:#6d55ec;background-image:linear-gradient(90deg,#4f46e5,#a855f7,#ec4899);border-radius:20px 20px 0 0;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding:40px 44px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="52" height="52" align="center" valign="middle" style="width:52px;height:52px;border-radius:14px;background-color:#eeecfd;font-size:24px;line-height:52px;">{icon}</td>
                    </tr>
                  </table>
                  <h1 style="margin:24px 0 12px;font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.4px;color:#1c1b29;">{heading}</h1>
                  <p style="margin:0 0 28px;font-size:15px;line-height:24px;color:#55536a;">{intro}</p>
                  <!-- Button -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="border-radius:12px;background-color:#4f46e5;background-image:linear-gradient(135deg,#4f46e5,#7c3aed);box-shadow:0 6px 16px -4px rgba(79,70,229,0.5);">
                        <a href="{link}" target="_blank" style="display:inline-block;padding:15px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">{cta} &rarr;</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:28px 0 0;font-size:13px;line-height:20px;color:#7a7890;">{note}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 44px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f6fb;border:1px solid #ecebf3;border-radius:12px;">
                    <tr>
                      <td style="padding:16px 18px;font-size:12px;line-height:18px;color:#7a7890;">
                        Button not working? Copy and paste this link into your browser:<br>
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
          <td align="center" style="padding:28px 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;color:#8f8da3;">
            &#128274; {security}<br>
            You received this email because of an action on your ExamDesk account.<br>
            &copy; ExamDesk &middot; Private exam platform
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

TEMPLATES = {
    "confirmation": dict(
        title="Confirm your ExamDesk account",
        preheader="One click to activate your account and join your course.",
        icon="&#9993;&#65039;",
        heading="Confirm your email address",
        intro="Welcome to ExamDesk! Please confirm that <strong style=\"color:#1c1b29;\">{{ .Email }}</strong> is your email address to activate your account. After that, join your course with the invitation code from your teacher.",
        cta="Confirm my email",
        link=SITE + "&amp;type=email&amp;next=/student",
        note="This link can be used once and expires soon. If you didn't create an ExamDesk account, you can safely ignore this email.",
        security="We'll never ask for your password by email.",
    ),
    "recovery": dict(
        title="Reset your ExamDesk password",
        preheader="Use this secure link to choose a new password.",
        icon="&#128273;",
        heading="Reset your password",
        intro="We received a request to reset the password for <strong style=\"color:#1c1b29;\">{{ .Email }}</strong>. Click the button below to choose a new one.",
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
        intro="Click the button below to sign in to ExamDesk as <strong style=\"color:#1c1b29;\">{{ .Email }}</strong>.",
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
        intro="Please confirm that you want to change your ExamDesk email from <strong style=\"color:#1c1b29;\">{{ .Email }}</strong> to <strong style=\"color:#1c1b29;\">{{ .NewEmail }}</strong>.",
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
        cta="Accept invitation",
        link=SITE + "&amp;type=invite&amp;next=/reset-password",
        note="This invitation link can be used once and expires soon.",
        security="Only accept invitations you were expecting.",
    ),
}

SUBJECTS = {
    "confirmation": "Confirm your ExamDesk account",
    "recovery": "Reset your ExamDesk password",
    "magic_link": "Your ExamDesk sign-in link",
    "email_change": "Confirm your new ExamDesk email",
    "invite": "You're invited to ExamDesk",
}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fields in TEMPLATES.items():
        (OUT / f"{name}.html").write_text(LAYOUT.format(**fields))
        print(f"wrote supabase/templates/{name}.html")
