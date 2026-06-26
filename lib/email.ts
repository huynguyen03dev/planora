import { Resend } from "resend";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Planora <noreply@localhost>";

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export function resolveFrom(fromName?: string): string {
  if (!fromName) return EMAIL_FROM;
  // Strip CRLF and angle brackets to prevent SMTP header injection and
  // malformed from values — fromName is interpolated from user-controlled
  // display names (user.name), which has no character constraint at the DB.
  const safeName = fromName.replace(/[\r\n<>]/g, "").trim();
  if (!safeName) return EMAIL_FROM;
  const match = EMAIL_FROM.match(/<([^>]+)>/);
  const address = match ? match[1] : EMAIL_FROM;
  return `${safeName} <${address}>`;
}

export async function sendEmail({
  to,
  subject,
  react,
  fromName,
}: {
  to: string;
  subject: string;
  react: React.ReactElement;
  fromName?: string;
}): Promise<void> {
  const resend = getResendClient();

  if (!resend) {
    console.log("[email] No RESEND_API_KEY configured. Logging email instead.");
    console.log(`[email] To: ${to}, Subject: ${subject}`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: resolveFrom(fromName),
      to,
      subject,
      react,
    });

    if (error) {
      console.error("[email] Resend error:", error);
    }
  } catch (error) {
    console.error("[email] Failed to send email:", error);
  }
}
