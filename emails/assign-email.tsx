import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  FallbackLink,
} from "./components/email-layout";

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
    <EmailLayout
      preview={`You have been assigned to "${cardTitle}" on ${boardName}`}
    >
      <EmailHeading>New card assignment</EmailHeading>
      <EmailText>
        <strong>{assignedByName}</strong> assigned you to the card{" "}
        <strong>{cardTitle}</strong> on the board <strong>{boardName}</strong>.
      </EmailText>
      <EmailButton href={cardLink}>View card</EmailButton>
      <FallbackLink href={cardLink} />
    </EmailLayout>
  );
}
