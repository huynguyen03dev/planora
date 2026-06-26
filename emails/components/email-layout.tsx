import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Shared branding + layout primitives for all Planora transactional emails.
 *
 * Every template renders through <EmailLayout> so the header (wordmark),
 * card chrome, typography, spacing, and footer stay consistent. Templates
 * supply only their own heading, body copy, and call to action via the
 * exported helpers below.
 */

export const brand = {
  accent: "#4f46e5", // indigo-600 — logo mark + links
  ink: "#18181b", // zinc-900 — headings, primary button, emphasis
  body: "#52525b", // zinc-600 — body copy
  muted: "#a1a1aa", // zinc-400 — footer / secondary copy
  border: "#e4e4e7", // zinc-200 — card + divider borders
  surface: "#ffffff", // card background
  canvas: "#f4f4f5", // zinc-100 — page background
} as const;

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const main: React.CSSProperties = {
  backgroundColor: brand.canvas,
  fontFamily: fontStack,
  margin: 0,
  padding: "32px 12px",
};

const card: React.CSSProperties = {
  backgroundColor: brand.surface,
  border: `1px solid ${brand.border}`,
  borderRadius: "12px",
  maxWidth: "480px",
  margin: "0 auto",
  overflow: "hidden",
};

const header: React.CSSProperties = {
  padding: "28px 32px 8px",
};

const logoMark: React.CSSProperties = {
  display: "inline-block",
  width: "28px",
  height: "28px",
  lineHeight: "28px",
  textAlign: "center",
  backgroundColor: brand.accent,
  color: "#ffffff",
  borderRadius: "7px",
  fontSize: "16px",
  fontWeight: 700,
};

const wordmark: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  color: brand.ink,
  letterSpacing: "-0.01em",
};

const content: React.CSSProperties = {
  padding: "8px 32px 24px",
};

const hr: React.CSSProperties = {
  borderColor: brand.border,
  margin: "0",
};

const footer: React.CSSProperties = {
  padding: "20px 32px 28px",
};

const footerText: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: brand.body,
  margin: "0 0 4px",
};

const footerMuted: React.CSSProperties = {
  fontSize: "12px",
  lineHeight: "18px",
  color: brand.muted,
  margin: 0,
};

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  lineHeight: "28px",
  fontWeight: 600,
  color: brand.ink,
  margin: "0 0 12px",
};

const bodyStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "24px",
  color: brand.body,
  margin: "0 0 24px",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: brand.ink,
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  padding: "12px 24px",
  borderRadius: "8px",
  textDecoration: "none",
  display: "inline-block",
};

const fallbackStyle: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: brand.muted,
  margin: "24px 0 0",
  wordBreak: "break-all",
};

const fallbackLinkStyle: React.CSSProperties = {
  color: brand.accent,
  textDecoration: "underline",
};

/** Section heading at the top of an email body. */
export function EmailHeading({ children }: { children: React.ReactNode }) {
  return <Text style={headingStyle}>{children}</Text>;
}

/** Primary body paragraph. Use <strong> inside for emphasis. */
export function EmailText({ children }: { children: React.ReactNode }) {
  return <Text style={bodyStyle}>{children}</Text>;
}

/** Primary call-to-action button. */
export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Button href={href} style={buttonStyle}>
      {children}
    </Button>
  );
}

/** Plain-text fallback link shown beneath the CTA for clients that strip buttons. */
export function FallbackLink({ href }: { href: string }) {
  return (
    <Text style={fallbackStyle}>
      Or copy and paste this link into your browser:{" "}
      <Link href={href} style={fallbackLinkStyle}>
        {href}
      </Link>
    </Text>
  );
}

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={card}>
          <Section style={header}>
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              style={{ borderCollapse: "collapse" }}
            >
              <tbody>
                <tr>
                  <td style={{ verticalAlign: "middle", paddingRight: "10px" }}>
                    <span style={logoMark}>P</span>
                  </td>
                  <td style={{ verticalAlign: "middle" }}>
                    <span style={wordmark}>Planora</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Section style={content}>{children}</Section>
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              Planora — your team&apos;s boards, organized.
            </Text>
            <Text style={footerMuted}>
              You received this email because you&apos;re a member of a Planora
              workspace.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
