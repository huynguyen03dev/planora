import { notFound } from "next/navigation";

import { isWorkspaceMember } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import db from "@/lib/prisma";
import { getWorkspaceIdBySlug } from "@/lib/workspace";

import { WorkspaceShellSidebar } from "@/components/workspace/workspace-shell-sidebar";

type WorkspaceShellLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function WorkspaceShellLayout({
  children,
  params,
}: WorkspaceShellLayoutProps) {
  const { userId } = await verifySession();
  const { slug } = await params;

  // Gate membership before revealing any workspace-identifying chrome.
  const workspaceRef = await getWorkspaceIdBySlug(slug);
  if (!workspaceRef) {
    notFound();
  }

  const isMember = await isWorkspaceMember(userId, workspaceRef.id);
  if (!isMember) {
    notFound();
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceRef.id },
    select: { id: true, name: true },
  });
  if (!workspace) {
    notFound();
  }

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <WorkspaceShellSidebar
        workspaceId={workspace.id}
        slug={slug}
        workspaceName={workspace.name}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
