import { Resend } from "resend";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Planora <noreply@localhost>";

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: React.ReactElement;
}): Promise<void> {
  const resend = getResendClient();

  if (!resend) {
    console.log("[email] No RESEND_API_KEY configured. Logging email instead.");
    console.log(`[email] To: ${to}, Subject: ${subject}`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
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
