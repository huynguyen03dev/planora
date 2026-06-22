import Link from "next/link";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getInvitationSummary } from "@/lib/invitation";
import { ReceivedInvitationsList } from "@/components/workspace/received-invitations-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface InvitePageProps {
  searchParams: Promise<{ invitationId?: string }>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const { invitationId } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });

  if (!invitationId) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-2xl">Invitation link invalid</CardTitle>
          <CardDescription>
            This invitation link is missing its identifier.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href={session ? "/invitations" : "/sign-in"}>
              {session ? "View your invitations" : "Go to sign in"}
            </Link>
          </Button>
        </CardFooter>
      </Shell>
    );
  }

  const invitation = await getInvitationSummary(invitationId);

  if (
    !invitation ||
    invitation.status !== "pending" ||
    invitation.expiresAt <= new Date()
  ) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-2xl">Invitation unavailable</CardTitle>
          <CardDescription>
            This invitation is no longer valid — it may have already been
            accepted or declined, or it has expired.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href={session ? "/invitations" : "/sign-in"}>
              {session ? "View your invitations" : "Go to sign in"}
            </Link>
          </Button>
        </CardFooter>
      </Shell>
    );
  }

  // Carry the invite back through auth, with the invited email pre-filled.
  const inviteUrl = `/invite?invitationId=${encodeURIComponent(invitation.id)}`;
  const redirectParam = encodeURIComponent(inviteUrl);
  const emailParam = encodeURIComponent(invitation.email);

  if (!session) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-2xl">
            You&apos;re invited to {invitation.workspaceName}
          </CardTitle>
          <CardDescription>
            {invitation.inviterName} invited{" "}
            <span className="font-medium">{invitation.email}</span> to join as{" "}
            {invitation.role}. Create an account or sign in with this email to
            accept.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-3 pt-2">
          <Button asChild className="w-full">
            <Link href={`/sign-up?redirect=${redirectParam}&email=${emailParam}`}>
              Create account
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/sign-in?redirect=${redirectParam}&email=${emailParam}`}>
              Sign in
            </Link>
          </Button>
        </CardFooter>
      </Shell>
    );
  }

  if (session.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-2xl">Different account</CardTitle>
          <CardDescription>
            This invitation was sent to{" "}
            <span className="font-medium">{invitation.email}</span>, but
            you&apos;re signed in as{" "}
            <span className="font-medium">{session.user.email}</span>. Sign in
            with the invited email to accept it.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/sign-in?redirect=${redirectParam}&email=${emailParam}`}>
              Switch account
            </Link>
          </Button>
        </CardFooter>
      </Shell>
    );
  }

  // Signed in with the invited email — accept/decline inline.
  return (
    <Shell>
      <CardHeader>
        <CardTitle className="text-2xl">Join {invitation.workspaceName}</CardTitle>
        <CardDescription>
          {invitation.inviterName} invited you to join as {invitation.role}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ReceivedInvitationsList invitations={[invitation]} />
      </CardContent>
    </Shell>
  );
}
