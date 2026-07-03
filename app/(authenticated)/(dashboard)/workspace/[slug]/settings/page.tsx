import { notFound } from "next/navigation";

import { hasWorkspacePermission, isWorkspaceMember } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import db from "@/lib/prisma";
import { getWorkspaceIdBySlug } from "@/lib/workspace";

import { AnalyticsSettingsForm } from "@/components/workspace/analytics-settings-form";

type SettingsPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { userId } = await verifySession();
  const { slug } = await params;

  const workspaceRef = await getWorkspaceIdBySlug(slug);
  if (!workspaceRef) {
    notFound();
  }
  const isMember = await isWorkspaceMember(userId, workspaceRef.id);
  if (!isMember) {
    notFound();
  }

  const workspaceId = workspaceRef.id;

  const canManage = await hasWorkspacePermission(workspaceId, {
    organization: ["update"],
  });

  const settings = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, timezone: true, requireEstimateBeforeDone: true },
  });
  if (!settings) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Workspace preferences that shape analytics and estimation.
        </p>
      </header>

      {canManage ? (
        <AnalyticsSettingsForm
          workspaceId={settings.id}
          timezone={settings.timezone}
          requireEstimateBeforeDone={settings.requireEstimateBeforeDone}
        />
      ) : (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Only workspace admins can change these settings.
        </p>
      )}
    </main>
  );
}
