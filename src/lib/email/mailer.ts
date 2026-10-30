import nodemailer from "nodemailer";
import {
  renderVerificationEmail,
  type VerificationEmailOptions,
  renderPasswordResetEmail,
  type PasswordResetEmailOptions,
  renderWelcomeEmail,
  type WelcomeEmailOptions,
  renderExamNotificationEmail,
  type ExamNotificationEmailOptions,
  renderResultNotificationEmail,
  type ResultNotificationEmailOptions,
  renderCourseInviteEmail,
  type CourseInviteEmailOptions,
} from "./templates";

const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT) || 465;
const smtpSecure = process.env.SMTP_SECURE === "false" ? false : true;
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = (process.env.SMTP_PASS || "").replace(/\s+/g, "");

export const mailer = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Low-level function to send an email via Nodemailer.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions) {
  const from = process.env.SMTP_FROM || `"ExamDesk" <${smtpUser}>`;
  return mailer.sendMail({
    from,
    to,
    subject,
    html,
    text,
  });
}

/**
 * Checks if the SMTP connection is active and credentials are valid.
 */
export async function verifySmtpConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await mailer.verify();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "SMTP connection failed",
    };
  }
}

/**
 * 1. Sends a 6-digit verification code OTP email.
 */
export async function sendVerificationOtpEmail({
  to,
  ...options
}: VerificationEmailOptions & { to: string }) {
  const { subject, html, text } = renderVerificationEmail(options);
  return sendEmail({ to, subject, html, text });
}

/**
 * 2. Sends a password reset email.
 */
export async function sendPasswordResetEmail({
  to,
  ...options
}: PasswordResetEmailOptions & { to: string }) {
  const { subject, html, text } = renderPasswordResetEmail(options);
  return sendEmail({ to, subject, html, text });
}

/**
 * 3. Sends a welcome email after account confirmation.
 */
export async function sendWelcomeEmail({
  to,
  ...options
}: WelcomeEmailOptions & { to: string }) {
  const { subject, html, text } = renderWelcomeEmail(options);
  return sendEmail({ to, subject, html, text });
}

/**
 * 4. Sends an exam notification or reminder to students.
 */
export async function sendExamAnnouncementEmail({
  to,
  ...options
}: ExamNotificationEmailOptions & { to: string }) {
  const { subject, html, text } = renderExamNotificationEmail(options);
  return sendEmail({ to, subject, html, text });
}

/**
 * 5. Sends an exam result notification when grading is released.
 */
export async function sendResultPublishedEmail({
  to,
  ...options
}: ResultNotificationEmailOptions & { to: string }) {
  const { subject, html, text } = renderResultNotificationEmail(options);
  return sendEmail({ to, subject, html, text });
}

/**
 * 6. Sends a course invitation email with invite code.
 */
export async function sendCourseInviteEmail({
  to,
  ...options
}: CourseInviteEmailOptions & { to: string }) {
  const { subject, html, text } = renderCourseInviteEmail(options);
  return sendEmail({ to, subject, html, text });
}

export * from "./templates";
