"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  initSocket,
  joinWorkspace,
  leaveWorkspace,
} from "@/lib/realtime/client";
import type { AnalyticsRefreshPayload } from "@/lib/realtime/types";

const REFRESH_DEBOUNCE_MS = 700;

type WorkspaceDashboardClientProps = {
  workspaceId: string;
};

export function WorkspaceDashboardClient({
  workspaceId,
}: WorkspaceDashboardClientProps) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the socket was already connected at mount, so a later
  // reconnect-after-drop resyncs the dashboard (F5 round-2 — mirrors the board
  // provider's reconnect resync).
  const connectedRef = useRef(false);

  useEffect(() => {
    const socket = initSocket();

    function scheduleRefresh(payload: AnalyticsRefreshPayload) {
      if (payload.workspaceId !== workspaceId) {
        return;
      }

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    }

    function handleConnect() {
      joinWorkspace(workspaceId);
      // A reconnect after a drop may have missed analytics events — pull the
      // authoritative data back through the same debounced refresh path.
      if (connectedRef.current) {
        scheduleRefresh({ workspaceId } as AnalyticsRefreshPayload);
      }
      connectedRef.current = true;
    }

    if (socket.connected) {
      joinWorkspace(workspaceId);
      connectedRef.current = true;
    }

    socket.on("connect", handleConnect);
    socket.on("analytics:refresh", scheduleRefresh);

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      socket.off("connect", handleConnect);
      socket.off("analytics:refresh", scheduleRefresh);
      leaveWorkspace(workspaceId);
    };
  }, [router, workspaceId]);

  return null;
}
