import { render } from "@react-email/render";
import type { Transporter } from "nodemailer";
import { Resend } from "resend";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Planora <noreply@localhost>";

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY);
}

// Dev/test SMTP sink (Mailpit). Email verification stays enforced everywhere
// (decision 0023); this only changes WHERE dev/test mail lands, so the real
// verification/reset link is retrievable from a local inbox instead of a live
// one. Lazily built and cached — nodemailer never loads on the Resend path.
// `undefined` = not yet resolved, `null` = no SMTP_HOST configured.
let smtpTransport: Transporter | null | undefined;

async function getSmtpTransport(): Promise<Transporter | null> {
  if (smtpTransport !== undefined) {
    return smtpTransport;
  }

  const host = process.env.SMTP_HOST;
  if (!host) {
    smtpTransport = null;
    return null;
  }

  const { createTransport } = await import("nodemailer");
  smtpTransport = createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    // Mailpit accepts any/no auth; only send credentials if explicitly set so
    // a bare local sink works out of the box.
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } }
      : {}),
  });
  return smtpTransport;
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
  const from = resolveFrom(fromName);
  const isProd = process.env.NODE_ENV === "production";

  // Dev/test: an explicit SMTP sink (Mailpit) captures the mail so the real
  // verification/reset link is retrievable without a live inbox. Gated to
  // non-production so a stray SMTP_HOST can never swallow real delivery.
  if (!isProd && process.env.SMTP_HOST) {
    const smtp = await getSmtpTransport();
    if (smtp) {
      try {
        await smtp.sendMail({
          from,
          to,
          subject,
          html: await render(react),
          text: await render(react, { plainText: true }),
        });
      } catch (error) {
        console.error("[email] SMTP (Mailpit) send failed:", error);
      }
      return;
    }
  }

  // Production (and any environment with a Resend key): real delivery.
  const resend = getResendClient();
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from,
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
    return;
  }

  // No transport configured: log so the flow is observable in a bare setup.
  console.log("[email] No mail transport (SMTP_HOST / RESEND_API_KEY). Logging instead.");
  console.log(`[email] To: ${to}, Subject: ${subject}`);
}
