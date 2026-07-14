import {
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
  FallbackLink,
} from "./components/email-layout";

type VerifyEmailEmailProps = {
  verifyLink: string;
};

export function VerifyEmailEmail({ verifyLink }: VerifyEmailEmailProps) {
  return (
    <EmailLayout
      preview={"Verify your Planora email address"}
      footerNote={
        "You received this email because you created a Planora account. If you didn't create an account, you can safely ignore this."
      }
    >
      <EmailHeading>Verify your email address</EmailHeading>
      <EmailText>
        Thanks for creating a Planora account. Click the button below to verify
        your email address and start using Planora. This link expires in one
        hour.
      </EmailText>
      <EmailButton href={verifyLink}>Verify email</EmailButton>
      <FallbackLink href={verifyLink} />
    </EmailLayout>
  );
}
