import { notFound, redirect } from "next/navigation";

import { isWorkspaceMember } from "@/lib/authorization";
import { verifySession } from "@/lib/dal";
import { getWorkspaceIdBySlug } from "@/lib/workspace";

type WorkspacePageProps = {
  params: Promise<{ slug: string }>;
};

// U8 (round-2): `/workspace/{slug}` previously had no page — direct access
// (sidebar "Boards" entry, workspace breadcrumbs) hit a 404. The workspace home
// IS its board list, so the root path now redirects to /boards?workspace={id}.
// The shell layout above still gates membership (notFound) before this runs;
// the lookup here is repeated only to resolve the id for the redirect query.
export default async function WorkspacePage({ params }: WorkspacePageProps) {
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

  redirect(`/boards?workspace=${workspaceRef.id}`);
}
