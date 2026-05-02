import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type InviteEmailProps = {
  workspaceName: string;
  inviteLink: string;
  invitedByEmail: string;
};

export function InviteEmail({
  workspaceName,
  inviteLink,
  invitedByEmail,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        You have been invited to join {workspaceName} on Planora
      </Preview>
      <Body style={{ fontFamily: "sans-serif", margin: "0 auto" }}>
        <Container>
          <Section>
            <Text style={{ fontSize: "24px", fontWeight: "bold" }}>
              You&apos;re invited to join {workspaceName}
            </Text>
            <Text>
              {invitedByEmail} has invited you to collaborate on the{" "}
              <strong>{workspaceName}</strong> workspace in Planora.
            </Text>
            <Button
              href={inviteLink}
              style={{
                backgroundColor: "#0f172a",
                color: "#fff",
                padding: "12px 24px",
                borderRadius: "6px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Accept Invitation
            </Button>
            <Text style={{ color: "#64748b", fontSize: "14px" }}>
              If the button doesn&apos;t work, copy and paste this link into
              your browser: {inviteLink}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
