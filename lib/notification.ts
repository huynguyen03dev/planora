import "server-only";

import db from "@/lib/prisma";
import { resolveMentions } from "@/lib/mention";
import { emitNotificationNew } from "@/lib/realtime/server";
import { sendEmail } from "@/lib/email";
import { AssignEmail } from "@/emails/assign-email";
import { MentionEmail } from "@/emails/mention-email";
import { DueDateEmail } from "@/emails/due-date-email";

export type NotificationRecord = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
};

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return db.notification.count({
    where: {
      userId,
      isRead: false,
      // INVITE notifications are surfaced directly from the invitation table in
      // the unified inbox, so they are excluded here to avoid double-counting.
      type: { not: "INVITE" },
    },
  });
}

export async function getNotificationsForUser(
  userId: string,
  options?: { limit?: number },
): Promise<NotificationRecord[]> {
  return db.notification.findMany({
    // INVITE notifications are surfaced directly from the invitation table in
    // the unified inbox; exclude them so the feed never double-lists an invite.
    where: { userId, type: { not: "INVITE" } },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      message: true,
      linkUrl: true,
      isRead: true,
      createdAt: true,
      readAt: true,
    },
  });
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await db.notification.updateMany({
    where: {
      id: notificationId,
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
}

async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  message: string;
  linkUrl?: string | null;
}): Promise<NotificationRecord> {
  const notification = await db.notification.create({
    data: {
      userId: data.userId,
      type: data.type as "ASSIGNED" | "COMMENT" | "INVITE" | "MENTIONED" | "DUE_DATE",
      title: data.title,
      message: data.message,
      linkUrl: data.linkUrl ?? null,
    },
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      message: true,
      linkUrl: true,
      isRead: true,
      createdAt: true,
      readAt: true,
    },
  });

  // Best-effort socket push
  try {
    emitNotificationNew(data.userId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      linkUrl: notification.linkUrl,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[notification] Failed to emit socket event:", error);
  }

  return notification;
}

export async function notifyCardAssigned(data: {
  recipientUserId: string;
  actorUserId: string;
  cardId: string;
  cardTitle: string;
  boardId: string;
  boardTitle: string;
  assignedByName: string;
}): Promise<void> {
  // Skip self-notification
  if (data.recipientUserId === data.actorUserId) {
    return;
  }

  const notification = await createNotification({
    userId: data.recipientUserId,
    type: "ASSIGNED",
    title: `Assigned to "${data.cardTitle}"`,
    message: `${data.assignedByName} assigned you to the card "${data.cardTitle}" on "${data.boardTitle}".`,
    linkUrl: `/boards/${data.boardId}`,
  });

  // Best-effort email
  try {
    const user = await db.user.findUnique({
      where: { id: data.recipientUserId },
      select: { email: true, name: true },
    });

    if (user) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      await sendEmail({
        to: user.email,
        subject: `You've been assigned to "${data.cardTitle}"`,
        react: AssignEmail({
          cardTitle: data.cardTitle,
          boardName: data.boardTitle,
          assignedByName: data.assignedByName,
          cardLink: `${appUrl}/boards/${data.boardId}`,
        }),
        fromName: `${data.assignedByName} (Planora)`,
      });
    }
  } catch (error) {
    console.error("[notification] Failed to send assignment email:", error);
  }

  void notification;
}

export async function notifyCommentOnCard(data: {
  cardId: string;
  cardTitle: string;
  boardId: string;
  boardTitle: string;
  commenterUserId: string;
  commenterName: string;
}): Promise<void> {
  // Get all card members (assigned users) + card creator, exclude commenter
  const card = await db.card.findUnique({
    where: { id: data.cardId },
    select: {
      createdById: true,
      members: {
        select: { userId: true },
      },
    },
  });

  if (!card) return;

  const recipientIds = new Set<string>();
  for (const member of card.members) {
    if (member.userId !== data.commenterUserId) {
      recipientIds.add(member.userId);
    }
  }
  if (card.createdById !== data.commenterUserId) {
    recipientIds.add(card.createdById);
  }

  if (recipientIds.size === 0) return;

  await Promise.all(
    Array.from(recipientIds).map((userId) =>
      createNotification({
        userId,
        type: "COMMENT",
        title: `Comment on "${data.cardTitle}"`,
        message: `${data.commenterName} commented on "${data.cardTitle}" on "${data.boardTitle}".`,
        linkUrl: `/boards/${data.boardId}`,
      }),
    ),
  );
}

export async function notifyMentioned(data: {
  content: string;
  cardId: string;
  cardTitle: string;
  boardId: string;
  boardTitle: string;
  commenterUserId: string;
  commenterName: string;
  workspaceId: string;
}): Promise<void> {
  try {
    // Fetch all workspace members (typical workspace < 500 members — fine to
    // load in one query and match in JS).
    const members = await db.workspaceMember.findMany({
      where: { organizationId: data.workspaceId },
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (members.length === 0) return;

    // Resolve mentions through the one shared resolver (lib/mention.ts), the
    // same matcher the comment highlighter uses. Dedupe by userId and drop the
    // commenter's own self-mention.
    const resolved = new Map<string, { userId: string; name: string; email: string | null }>();
    const matches = resolveMentions(
      data.content,
      members.map((m) => ({
        userId: m.userId,
        name: m.user.name ?? "",
        email: m.user.email ?? null,
      })),
    );
    for (const { member } of matches) {
      resolved.set(member.userId, member);
    }
    resolved.delete(data.commenterUserId);

    if (resolved.size === 0) return;

    const recipients = Array.from(resolved.values());

    await Promise.all(
      recipients.map((member) =>
        createNotification({
          userId: member.userId,
          type: "MENTIONED",
          title: `Mentioned in "${data.cardTitle}"`,
          message: `${data.commenterName} mentioned you in a comment on "${data.cardTitle}" in "${data.boardTitle}".`,
          linkUrl: `/boards/${data.boardId}`,
        }),
      ),
    );

    // Best-effort mention emails — sent concurrently so one slow or failing
    // recipient neither blocks nor drops the others.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await Promise.allSettled(
      recipients.map(async (member) => {
        if (!member.email) return;

        try {
          await sendEmail({
            to: member.email,
            subject: `You were mentioned in "${data.cardTitle}"`,
            react: MentionEmail({
              mentionedByName: data.commenterName,
              cardTitle: data.cardTitle,
              boardName: data.boardTitle,
              cardLink: `${appUrl}/boards/${data.boardId}`,
            }),
            fromName: `${data.commenterName} mentioned you (Planora)`,
          });
        } catch (emailError) {
          console.error("[notification] Failed to send mention email:", emailError);
        }
      }),
    );
  } catch (error) {
    console.error("[notification] Failed to send mention notifications:", error);
  }
}

export async function notifyInvited(data: {
  invitedEmail: string;
  inviterName: string;
  workspaceName: string;
}): Promise<void> {
  // Intentionally a no-op. Pending workspace invitations are now surfaced
  // directly in the unified inbox (the notification bell) from the invitation
  // table, with inline Accept / Decline actions — see lib/notifications/inbox.ts
  // and the /api/invitations/pending route. Creating a separate INVITE
  // notification row here would duplicate that signal, so we no longer do it.
  // The signature is preserved so existing callers in the invite flow keep
  // working without change.
  void data;
}

export async function notifyDueDate(data: {
  userId: string;
  cardId: string;
  cardTitle: string;
  boardId: string;
  boardTitle: string;
  milestone: "DUE_SOON" | "OVERDUE";
  dueDate: Date;
}): Promise<void> {
  const milestoneLabel = data.milestone === "DUE_SOON" ? "due soon" : "overdue";
  const title = `"${data.cardTitle}" is ${milestoneLabel}`;
  const message =
    data.milestone === "DUE_SOON"
      ? `The card "${data.cardTitle}" on "${data.boardTitle}" is due soon.`
      : `The card "${data.cardTitle}" on "${data.boardTitle}" is overdue.`;

  try {
    const notification = await createNotification({
      userId: data.userId,
      type: "DUE_DATE",
      title,
      message,
      linkUrl: `/boards/${data.boardId}`,
    });

    // Best-effort email
    try {
      const user = await db.user.findUnique({
        where: { id: data.userId },
        select: { email: true, name: true },
      });

      if (user) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await sendEmail({
          to: user.email,
          subject: title,
          react: DueDateEmail({
            milestone: data.milestone,
            cardTitle: data.cardTitle,
            boardName: data.boardTitle,
            cardLink: `${appUrl}/boards/${data.boardId}`,
          }),
        });
      }
    } catch (emailError) {
      console.error("[notification] Failed to send due-date email:", emailError);
    }

    void notification;
  } catch (error) {
    // Re-throw so the caller (scheduler) can roll back the CardReminder claim
    throw error;
  }
}
