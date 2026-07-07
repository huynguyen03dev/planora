import { notFound } from "next/navigation";

import { hasWorkspacePermission, isWorkspaceMember } from "@/lib/authorization";
import { loadAutomationView } from "@/lib/automation/view";
import { verifySession } from "@/lib/dal";
import { getWorkspaceIdBySlug } from "@/lib/workspace";

import { AutomationManagement } from "@/components/workspace/automation/automation-management";

type AutomationPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function AutomationPage({ params }: AutomationPageProps) {
  const { userId } = await verifySession();
  const { slug } = await params;

  // Re-gate at the page even though the layout does (cheap; keeps the page safe
  // if ever reached outside the shell).
  const workspaceRef = await getWorkspaceIdBySlug(slug);
  if (!workspaceRef) {
    notFound();
  }
  const workspaceId = workspaceRef.id;

  if (!(await isWorkspaceMember(userId, workspaceId))) {
    notFound();
  }

  // `organization:update` is admin-exclusive — the single gate for every rule
  // mutation. Reads (this page) are open to any member; the affordances are
  // hidden for non-admins and the Server Actions re-enforce it regardless.
  const [canManage, view] = await Promise.all([
    hasWorkspacePermission(workspaceId, { organization: ["update"] }),
    loadAutomationView(workspaceId),
  ]);

  return (
    <AutomationManagement
      workspaceId={workspaceId}
      canManage={canManage}
      rules={view.rules}
      options={view.options}
      logs={view.logs}
      lastRunByRule={view.lastRunByRule}
    />
  );
}
