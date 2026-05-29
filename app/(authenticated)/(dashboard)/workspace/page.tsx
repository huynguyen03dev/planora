import Link from "next/link";
import { redirect } from "next/navigation";

import { hasWorkspacePermission } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import { listWorkspacePendingInvitations } from "@/lib/invitation";
import db from "@/lib/prisma";
import { listWorkspaceMembershipsByUserId } from "@/lib/workspace";

import { AnalyticsSettingsForm } from "@/components/workspace/analytics-settings-form";
import { InviteMemberForm } from "@/components/workspace/invite-member-form";
import { WorkspaceInvitationsList } from "@/components/workspace/workspace-invitations-list";

type WorkspacePageProps = {
  searchParams: Promise<{
    workspace?: string;
  }>;
};

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const { userId } = await verifySession();
  const params = await searchParams;

  const memberships = await listWorkspaceMembershipsByUserId(userId);
  const workspaces = memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
  }));

  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const selectedWorkspaceId = params.workspace ?? null;

  if (selectedWorkspaceId && !workspaceIds.has(selectedWorkspaceId)) {
    redirect("/workspace");
  }

  const canManageSelectedWorkspace = selectedWorkspaceId
    ? await hasWorkspacePermission(selectedWorkspaceId, {
        invitation: ["create"],
      })
    : false;

  const selectedWorkspaceInvitations = selectedWorkspaceId && canManageSelectedWorkspace
    ? await listWorkspacePendingInvitations(selectedWorkspaceId)
    : [];
  const selectedWorkspaceSettings = selectedWorkspaceId && canManageSelectedWorkspace
    ? await db.workspace.findUnique({
        where: { id: selectedWorkspaceId },
        select: {
          id: true,
          timezone: true,
          requireEstimateBeforeDone: true,
        },
      })
    : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Workspace invitations</h1>
        <p className="text-sm text-muted-foreground">
          Invite teammates and manage invitations for your workspaces.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border p-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Workspace management</h2>
          <p className="text-sm text-muted-foreground">
            Select a workspace to send invitations and review pending invites.
          </p>
        </div>

        {workspaces.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {workspaces.map((workspace) => {
              const isActive = workspace.id === selectedWorkspaceId;

              return (
                <Link
                  key={workspace.id}
                  href={`/workspace?workspace=${workspace.id}`}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {workspace.name}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You are not a member of any workspace yet.
          </p>
        )}

        {selectedWorkspaceId ? (
          canManageSelectedWorkspace ? (
            <div className="space-y-5">
              <InviteMemberForm workspaceId={selectedWorkspaceId} />
              {selectedWorkspaceSettings ? (
                <AnalyticsSettingsForm
                  workspaceId={selectedWorkspaceSettings.id}
                  timezone={selectedWorkspaceSettings.timezone}
                  requireEstimateBeforeDone={
                    selectedWorkspaceSettings.requireEstimateBeforeDone
                  }
                />
              ) : null}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Pending invitations</h3>
                <WorkspaceInvitationsList invitations={selectedWorkspaceInvitations} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You do not have permission to manage invitations for this workspace.
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a workspace above to manage invitations.
          </p>
        )}
      </section>
    </main>
  );
}
