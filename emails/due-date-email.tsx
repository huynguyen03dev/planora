import { Text } from "@react-email/components";

import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  FallbackLink,
} from "./components/email-layout";

type DueDateEmailProps = {
  milestone: "DUE_SOON" | "OVERDUE";
  cardTitle: string;
  boardName: string;
  cardLink: string;
};

const badgePalette = {
  DUE_SOON: { background: "#fef3c7", color: "#92400e", label: "Due soon" },
  OVERDUE: { background: "#fee2e2", color: "#991b1b", label: "Overdue" },
} as const;

export function DueDateEmail({
  milestone,
  cardTitle,
  boardName,
  cardLink,
}: DueDateEmailProps) {
  const label = milestone === "DUE_SOON" ? "due soon" : "overdue";
  const previewText = `"${cardTitle}" is ${label} on ${boardName}`;
  const heading = milestone === "DUE_SOON" ? "Card due soon" : "Card overdue";
  const badge = badgePalette[milestone];

  return (
    <EmailLayout preview={previewText}>
      <Text
        style={{
          display: "inline-block",
          backgroundColor: badge.background,
          color: badge.color,
          fontSize: "12px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          padding: "4px 10px",
          borderRadius: "9999px",
          margin: "0 0 12px",
        }}
      >
        {badge.label}
      </Text>
      <EmailHeading>{heading}</EmailHeading>
      <EmailText>
        The card <strong>{cardTitle}</strong> on <strong>{boardName}</strong> is{" "}
        {label}.
      </EmailText>
      <EmailButton href={cardLink}>View card</EmailButton>
      <FallbackLink href={cardLink} />
    </EmailLayout>
  );
}
