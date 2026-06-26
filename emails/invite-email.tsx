import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  FallbackLink,
} from "./components/email-layout";

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
    <EmailLayout
      preview={`You have been invited to join ${workspaceName} on Planora`}
      footerNote={`You received this email because ${invitedByEmail} invited you to collaborate on Planora. If you weren't expecting this, you can safely ignore it.`}
    >
      <EmailHeading>You&apos;re invited to join {workspaceName}</EmailHeading>
      <EmailText>
        <strong>{invitedByEmail}</strong> has invited you to collaborate on the{" "}
        <strong>{workspaceName}</strong> workspace in Planora.
      </EmailText>
      <EmailButton href={inviteLink}>Accept invitation</EmailButton>
      <FallbackLink href={inviteLink} />
    </EmailLayout>
  );
}
