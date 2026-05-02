"use server";

import { verifySession } from "@/lib/dal";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notification";

type MarkReadResult =
  | { success: true }
  | { success: false, error: string };

export async function markNotificationReadAction(
  notificationId: string,
): Promise<MarkReadResult> {
  const { userId } = await verifySession();

  try {
    await markNotificationRead(notificationId, userId);
    return { success: true };
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    return { success: false, error: "Failed to mark notification as read" };
  }
}

export async function markAllNotificationsReadAction(): Promise<MarkReadResult> {
  const { userId } = await verifySession();

  try {
    await markAllNotificationsRead(userId);
    return { success: true };
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
    return { success: false, error: "Failed to mark all notifications as read" };
  }
}
