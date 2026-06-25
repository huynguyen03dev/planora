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

type MentionEmailProps = {
  mentionedByName: string;
  cardTitle: string;
  boardName: string;
  cardLink: string;
};

export function MentionEmail({
  mentionedByName,
  cardTitle,
  boardName,
  cardLink,
}: MentionEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {mentionedByName} mentioned you in a comment on &quot;{cardTitle}
        &quot; on {boardName}
      </Preview>
      <Body style={{ fontFamily: "sans-serif", margin: "0 auto" }}>
        <Container>
          <Section>
            <Text style={{ fontSize: "24px", fontWeight: "bold" }}>
              Mention in a comment
            </Text>
            <Text>
              {mentionedByName} mentioned you in a comment on{" "}
              <strong>{cardTitle}</strong> on{" "}
              <strong>{boardName}</strong>.
            </Text>
            <Button
              href={cardLink}
              style={{
                backgroundColor: "#0f172a",
                color: "#fff",
                padding: "12px 24px",
                borderRadius: "6px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              View Card
            </Button>
            <Text style={{ color: "#64748b", fontSize: "14px" }}>
              If the button doesn&apos;t work, copy and paste this link into
              your browser: {cardLink}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
