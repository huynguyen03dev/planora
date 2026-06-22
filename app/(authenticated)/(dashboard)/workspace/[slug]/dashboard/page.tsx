import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getWorkspaceAnalyticsAction } from "./actions";
import { DashboardShell } from "./components/dashboard-shell";
import { BurndownChart } from "./components/burndown-chart";
import { FlowChart } from "./components/flow-chart";
import { KPICards } from "./components/kpi-cards";
import { FilterBar } from "./components/filter-bar";
import { LaunchBoundaryBanner } from "./components/launch-boundary-banner";
import { DataQualitySection } from "./components/data-quality-section";
import { LeadTimeTable } from "./components/lead-time-table";
import db from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { isWorkspaceMember } from "@/lib/authorization";
import type { AnalyticsFilters } from "@/lib/analytics/types";
import { WorkspaceDashboardClient } from "@/components/workspace/workspace-dashboard-client";

interface DashboardPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    board?: string;
    member?: string;
    range?: "7d" | "30d" | "90d";
    from?: string;
    to?: string;
    includeArchivedBoards?: string;
  }>;
}

async function getWorkspaceIdBySlug(slug: string) {
  return db.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
}

async function getWorkspaceData(workspaceId: string) {
  return db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      timezone: true,
      analyticsLaunchAt: true,
    },
  });
}

async function getWorkspaceBoards(workspaceId: string, includeArchivedBoards: boolean) {
  return db.board.findMany({
    where: {
      workspaceId,
      ...(includeArchivedBoards ? {} : { archivedAt: null }),
    },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
  });
}

async function getWorkspaceMembers(workspaceId: string) {
  const members = await db.workspaceMember.findMany({
    where: { organizationId: workspaceId },
    select: {
      userId: true,
      user: {
        select: {
          name: true,
          image: true,
        },
      },
    },
  });

  return members.map((m) => ({
    id: m.userId,
    name: m.user.name ?? "Unknown",
    image: m.user.image,
  }));
}

function parseSearchParams(
  searchParams: DashboardPageProps["searchParams"] extends Promise<infer T>
    ? T
    : never,
): AnalyticsFilters {
  const filters: AnalyticsFilters = {
    preset: searchParams.range ?? "30d",
  };

  if (searchParams.board) {
    filters.boardId = searchParams.board;
  }

  if (searchParams.member) {
    filters.memberId = searchParams.member;
  }

  if (searchParams.from) {
    filters.from = new Date(searchParams.from);
  }

  if (searchParams.to) {
    filters.to = new Date(searchParams.to);
  }

  if (searchParams.includeArchivedBoards === "1") {
    filters.includeArchivedBoards = true;
  }

  return filters;
}

export default async function DashboardPage({
  params,
  searchParams,
}: DashboardPageProps) {
  const { userId } = await verifySession();
  const { slug } = await params;
  const queryParams = await searchParams;

  // Gate membership before fetching workspace-identifying data
  const workspaceRef = await getWorkspaceIdBySlug(slug);
  if (!workspaceRef) {
    notFound();
  }
  const isMember = await isWorkspaceMember(userId, workspaceRef.id);
  if (!isMember) {
    notFound();
  }

  const workspace = await getWorkspaceData(workspaceRef.id);
  if (!workspace) {
    notFound();
  }

  const filters = parseSearchParams(queryParams);

  const [boards, members, analyticsResult] = await Promise.all([
    getWorkspaceBoards(workspace.id, queryParams.includeArchivedBoards === "1"),
    getWorkspaceMembers(workspace.id),
    getWorkspaceAnalyticsAction(slug, filters),
  ]);

  if (!analyticsResult.success) {
    return (
      <DashboardShell workspaceName={workspace.name}>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          {analyticsResult.error}
        </div>
      </DashboardShell>
    );
  }

  const analytics = analyticsResult.data;

  return (
    <DashboardShell workspaceName={workspace.name}>
      <WorkspaceDashboardClient workspaceId={workspace.id} />

      {analytics.launchBoundary.selectedRangeCrossesBoundary && (
        <LaunchBoundaryBanner message={analytics.launchBoundary.message} />
      )}

      <FilterBar
        workspaceSlug={slug}
        boards={boards}
        members={members}
        currentFilters={queryParams}
      />

      <Suspense fallback={<KPICardsSkeleton />}>
        <KPICards analytics={analytics} />
      </Suspense>

      <Suspense fallback={<BurndownChartSkeleton />}>
        <FlowChart
          data={analytics.flow.points}
          createdTotal={analytics.flow.createdTotal}
          completedTotal={analytics.flow.completedTotal}
        />
      </Suspense>

      <Suspense fallback={<BurndownChartSkeleton />}>
        <BurndownChart data={analytics.burndown} />
      </Suspense>

      <DataQualitySection analytics={analytics} workspaceSlug={slug} />

      <LeadTimeTable
        rows={analytics.leadTime.rows}
        totalCompleted={analytics.leadTime.totalCompleted}
      />
    </DashboardShell>
  );
}

function KPICardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-lg bg-muted"
        />
      ))}
    </div>
  );
}

function BurndownChartSkeleton() {
  return (
    <div className="h-80 animate-pulse rounded-lg bg-muted" />
  );
}
