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

type AssignEmailProps = {
  cardTitle: string;
  boardName: string;
  assignedByName: string;
  cardLink: string;
};

export function AssignEmail({
  cardTitle,
  boardName,
  assignedByName,
  cardLink,
}: AssignEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        You have been assigned to &quot;{cardTitle}&quot; on {boardName}
      </Preview>
      <Body style={{ fontFamily: "sans-serif", margin: "0 auto" }}>
        <Container>
          <Section>
            <Text style={{ fontSize: "24px", fontWeight: "bold" }}>
              New card assignment
            </Text>
            <Text>
              {assignedByName} assigned you to the card{" "}
              <strong>{cardTitle}</strong> on the board{" "}
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
