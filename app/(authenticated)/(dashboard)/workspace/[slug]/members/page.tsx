import { notFound } from "next/navigation";

import { hasWorkspacePermission, isWorkspaceMember } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import { listWorkspacePendingInvitations } from "@/lib/invitation";
import { getWorkspaceIdBySlug } from "@/lib/workspace";
import { getWorkspaceMembersForManagement } from "@/lib/workspace-members";

import { MemberManagement } from "@/components/workspace/members/member-management";

type MembersPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function MembersPage({ params }: MembersPageProps) {
  const { userId } = await verifySession();
  const { slug } = await params;

  // Re-gate at the page even though the layout does: cheap, and keeps the page
  // safe if ever reached outside the shell.
  const workspaceRef = await getWorkspaceIdBySlug(slug);
  if (!workspaceRef) {
    notFound();
  }
  const isMember = await isWorkspaceMember(userId, workspaceRef.id);
  if (!isMember) {
    notFound();
  }

  const workspaceId = workspaceRef.id;

  // `member:update` is admin-only — the single gate for every management
  // affordance on this page. Pending invitations are management-only info.
  const canManage = await hasWorkspacePermission(workspaceId, {
    member: ["update"],
  });

  const [members, pendingInvitations] = await Promise.all([
    getWorkspaceMembersForManagement(workspaceId),
    canManage
      ? listWorkspacePendingInvitations(workspaceId)
      : Promise.resolve([]),
  ]);

  return (
    <MemberManagement
      workspaceId={workspaceId}
      currentUserId={userId}
      canManage={canManage}
      members={members}
      pendingInvitations={pendingInvitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      }))}
    />
  );
}
