import "server-only";

import db from "@/lib/prisma";
import { emitNotificationNew } from "@/lib/realtime/server";
import { sendEmail } from "@/lib/email";
import { AssignEmail } from "@/emails/assign-email";

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
    },
  });
}

export async function getNotificationsForUser(
  userId: string,
  options?: { limit?: number },
): Promise<NotificationRecord[]> {
  return db.notification.findMany({
    where: { userId },
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
      type: data.type as "ASSIGNED" | "COMMENT" | "INVITE",
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

export async function notifyInvited(data: {
  invitedEmail: string;
  inviterName: string;
  workspaceName: string;
}): Promise<void> {
  // Only create in-app notification if the invited user has an account
  const user = await db.user.findUnique({
    where: { email: data.invitedEmail },
    select: { id: true },
  });

  if (!user) return;

  await createNotification({
    userId: user.id,
    type: "INVITE",
    title: `Invited to "${data.workspaceName}"`,
    message: `${data.inviterName} invited you to join the workspace "${data.workspaceName}".`,
    linkUrl: "/invitations",
  });
}
