import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  FallbackLink,
} from "./components/email-layout";

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
    <EmailLayout
      preview={`${mentionedByName} mentioned you in a comment on "${cardTitle}" on ${boardName}`}
    >
      <EmailHeading>You were mentioned in a comment</EmailHeading>
      <EmailText>
        <strong>{mentionedByName}</strong> mentioned you in a comment on{" "}
        <strong>{cardTitle}</strong> on <strong>{boardName}</strong>.
      </EmailText>
      <EmailButton href={cardLink}>View card</EmailButton>
      <FallbackLink href={cardLink} />
    </EmailLayout>
  );
}
