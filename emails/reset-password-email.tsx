import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  FallbackLink,
} from "./components/email-layout";

type ResetPasswordEmailProps = {
  resetLink: string;
};

export function ResetPasswordEmail({ resetLink }: ResetPasswordEmailProps) {
  return (
    <EmailLayout
      preview={"Reset your Planora password"}
      footerNote={
        "You received this email because someone requested a password reset for your Planora account. If you didn't request this, you can safely ignore it."
      }
    >
      <EmailHeading>Reset your password</EmailHeading>
      <EmailText>
        Someone requested a password reset for your Planora account. Click the
        button below to set a new password. This link expires in one hour.
      </EmailText>
      <EmailButton href={resetLink}>Reset password</EmailButton>
      <FallbackLink href={resetLink} />
    </EmailLayout>
  );
}
