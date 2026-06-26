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

type DueDateEmailProps = {
  milestone: "DUE_SOON" | "OVERDUE";
  cardTitle: string;
  boardName: string;
  cardLink: string;
};

export function DueDateEmail({
  milestone,
  cardTitle,
  boardName,
  cardLink,
}: DueDateEmailProps) {
  const label = milestone === "DUE_SOON" ? "due soon" : "overdue";
  const previewText = `"${cardTitle}" is ${label} on ${boardName}`;
  const heading =
    milestone === "DUE_SOON" ? "Card due soon" : "Card overdue";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ fontFamily: "sans-serif", margin: "0 auto" }}>
        <Container>
          <Section>
            <Text style={{ fontSize: "24px", fontWeight: "bold" }}>
              {heading}
            </Text>
            <Text>
              The card <strong>{cardTitle}</strong> on{" "}
              <strong>{boardName}</strong> is{" "}
              {milestone === "DUE_SOON" ? "due soon" : "overdue"}.
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
