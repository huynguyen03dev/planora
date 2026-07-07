/**
 * Dynamic-target resolver for the automation rules engine (decision 0022 R2).
 *
 * Expands dynamic tokens (e.g. "card-assignees", "card-creator", uuid literal)
 * to concrete workspace-member user IDs at fire time.  Every resolved ID is
 * workspace-isolation-checked.
 *
 * Uses Prisma reads only (no writes).  Accepts an optional transaction client
 * so it can run inside the trigger transaction or standalone.
 */

import type { Prisma } from "@/app/generated/prisma/client";

import db from "@/lib/prisma";

type Client = Prisma.TransactionClient | typeof db;

export class CrossWorkspaceTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossWorkspaceTargetError";
  }
}

/**
 * Resolve an assign-member / notify-member recipient token to concrete user IDs.
 *
 * - "card-assignees" → all cardMember.userId for cardId, filtered to current
 *   workspace members (former members are silently dropped).
 * - "card-creator"   → card.createdById, returned only if still a current
 *   workspace member (else []).
 * - <uuid literal>   → [uuid] iff that user is a current workspace member;
 *   otherwise throws CrossWorkspaceTargetError.
 */
export async function resolveRecipient(
  client: Client,
  token: string,
  ctx: { cardId: string; workspaceId: string },
): Promise<string[]> {
  if (token === "card-assignees") {
    const members = await client.cardMember.findMany({
      where: { cardId: ctx.cardId },
      select: { userId: true },
    });
    const ids = members.map((m: { userId: string }) => m.userId);

    // Filter to current workspace members only.
    const resolved: string[] = [];
    for (const id of ids) {
      const membership = await client.workspaceMember.findFirst({
        where: { organizationId: ctx.workspaceId, userId: id },
        select: { id: true },
      });
      if (membership) resolved.push(id);
    }
    return resolved;
  }

  if (token === "card-creator") {
    const card = await client.card.findUnique({
      where: { id: ctx.cardId },
      select: { createdById: true },
    });
    if (!card?.createdById) return [];

    const membership = await client.workspaceMember.findFirst({
      where: { organizationId: ctx.workspaceId, userId: card.createdById },
      select: { id: true },
    });
    return membership ? [card.createdById] : [];
  }

  // UUID literal — must be a current workspace member.
  const membership = await client.workspaceMember.findFirst({
    where: { organizationId: ctx.workspaceId, userId: token },
    select: { id: true },
  });
  if (!membership) {
    throw new CrossWorkspaceTargetError(
      `User ${token} is not a member of workspace ${ctx.workspaceId}`,
    );
  }
  return [token];
}

/**
 * Resolve a remove-member scope token to concrete user IDs to remove.
 *
 * - "all"          → all cardMember.userId currently on the card (no
 *   membership filter; they are being removed).
 * - <uuid literal> → [uuid] (removal of a non-member is a harmless no-op
 *   downstream; do NOT throw).
 */
export async function resolveRemoveScope(
  client: Client,
  token: string,
  ctx: { cardId: string; workspaceId: string },
): Promise<string[]> {
  if (token === "all") {
    const members = await client.cardMember.findMany({
      where: { cardId: ctx.cardId },
      select: { userId: true },
    });
    return members.map((m: { userId: string }) => m.userId);
  }

  // UUID literal — return directly, no membership check needed.
  return [token];
}
