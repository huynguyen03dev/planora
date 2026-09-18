/**
 * Mailpit inbox helpers for E2E. Email verification is enforced everywhere
 * (decision 0023); in dev/test the mail lands in Mailpit (docker-compose) rather
 * than a real inbox, so tests retrieve the REAL verification link from Mailpit's
 * REST API and complete the actual flow — no verification bypass. Requires the
 * Mailpit container (docker compose up mailpit) and SMTP_HOST pointing the app at
 * it. See lib/email.ts transport selection.
 */
const MAILPIT_API = process.env.MAILPIT_API ?? "http://localhost:8025";

type MailpitSummary = { ID: string };

/**
 * Poll Mailpit for the most recent message to `email` and return the
 * `/verify-email?token=...` link found in it. Throws if none arrives in time.
 */
export async function fetchVerificationLink(
  email: string,
  { timeoutMs = 15_000, pollMs = 500 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT_API}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`,
    );
    if (search.ok) {
      const { messages } = (await search.json()) as { messages?: MailpitSummary[] };
      const latest = messages?.[0];
      if (latest) {
        const full = await fetch(`${MAILPIT_API}/api/v1/message/${latest.ID}`);
        if (full.ok) {
          const body = (await full.json()) as { Text?: string; HTML?: string };
          const content = `${body.Text ?? ""}\n${body.HTML ?? ""}`;
          const match = content.match(
              /https?:\/\/[^\s"'<>]*\/verify-email\?token=[^\s"'<>]+/,
          );
          if (match) return match[0];
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`No verification email for ${email} arrived in Mailpit within ${timeoutMs}ms`);
}

/** Delete all captured messages — call in beforeEach to keep inboxes isolated. */
export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_API}/api/v1/messages`, { method: "DELETE" }).catch(() => {});
}
