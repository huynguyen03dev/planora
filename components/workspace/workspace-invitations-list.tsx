import type { WorkspacePendingInvitationRecord } from "@/lib/invitation";

type WorkspaceInvitationsListProps = {
  invitations: WorkspacePendingInvitationRecord[];
};

export function WorkspaceInvitationsList({
  invitations,
}: WorkspaceInvitationsListProps) {
  if (invitations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No pending invitations for this workspace.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {invitations.map((invitation) => (
        <div
          key={invitation.id}
          className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-medium">{invitation.email}</p>
            <p className="text-xs text-muted-foreground">
              Role: {invitation.role} · Invited by {invitation.inviterName}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Expires {new Date(invitation.expiresAt).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}
