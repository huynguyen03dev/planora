import { InboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { verifySession } from "@/lib/dal";
import { listReceivedPendingInvitationsByEmail } from "@/lib/invitation";

import { ReceivedInvitationsList } from "@/components/workspace/received-invitations-list";

export default async function InvitationsPage() {
  const { user } = await verifySession();

  const invitations = await listReceivedPendingInvitationsByEmail(user.email);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Invitations</h1>
        <p className="text-sm text-muted-foreground">
          Pending workspace invitations sent to{" "}
          <span className="font-medium">{user.email}</span>.
        </p>
      </header>

      {invitations.length > 0 ? (
        <section className="space-y-3 rounded-xl border p-4">
          <ReceivedInvitationsList invitations={invitations} />
        </section>
      ) : (
        <section className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <HugeiconsIcon
            icon={InboxIcon}
            className="size-10 text-muted-foreground/50"
          />
          <p className="text-sm font-medium">No pending invitations</p>
          <p className="text-xs text-muted-foreground">
            When someone invites you to a workspace, it will appear here.
          </p>
        </section>
      )}
    </main>
  );
}
