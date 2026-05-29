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
    }

    if (socket.connected) {
      joinWorkspace(workspaceId);
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
