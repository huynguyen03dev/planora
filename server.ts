import { createServer } from "http";

import { parse } from "url";
import next from "next";

import { initIO, emitBoardPresence } from "@/lib/realtime/server";
import { authenticateSocket, canUserJoinWorkspace, getBoardMembershipRole, getUserProfile } from "@/lib/realtime/auth";
import { ROOMS } from "@/lib/realtime/events";
import { presenceRegistry } from "@/lib/realtime/presence";
import type { UserProfile, Watcher } from "@/lib/realtime/types";

type SocketData = { userId: string; profile?: UserProfile | null };

const dev = process.env.NODE_ENV !== "production";
const hostname = dev ? "localhost" : (process.env.HOSTNAME || "0.0.0.0");
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port, dir: process.cwd() });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  const io = initIO(server);

  io.use(async (socket, next) => {
    const userId = await authenticateSocket({
      headers: socket.handshake.headers as Record<string, string>,
    });

    if (!userId) {
      return next(new Error("Unauthorized"));
    }

    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    const userId = (socket.data as SocketData).userId;
    socket.join(ROOMS.user(userId));

    // F1 race guard: record which boards/workspaces this socket wants to join
    // synchronously, so a leave emitted during the join's async authz query can
    // cancel it — otherwise the join leaves a ghost room membership / watcher
    // until disconnect.
    const wantedBoards = new Set<string>();
    const wantedWorkspaces = new Set<string>();

    socket.on("board:join", async (payload) => {
      const { boardId } = payload;
      wantedBoards.add(boardId);
      // One query resolves both authorization (null = denied) and the role used
      // for the presence admin badge (US-047).
      const role = await getBoardMembershipRole(userId, boardId);

      if (!role) {
        // Client may have navigated away during the authz query — don't error
        // a socket that no longer wants this board.
        if (socket.connected && wantedBoards.has(boardId)) {
          socket.emit("board:error", { message: "Not authorized to join this board" });
        }
        return;
      }

      // Tab may have closed or the client left during the auth round-trip —
      // don't join a room or register a watcher for a ghost (F1).
      if (!socket.connected || !wantedBoards.has(boardId)) {
        wantedBoards.delete(boardId);
        return;
      }

      socket.join(ROOMS.board(boardId));

      // Resolve the display profile once per connection (it never changes).
      const data = socket.data as SocketData;
      if (data.profile === undefined) {
        data.profile = await getUserProfile(userId);
      }
      const profile = data.profile;
      if (!profile || !socket.connected || !wantedBoards.has(boardId)) {
        return;
      }

      // Role is board-specific, so it is merged in here rather than cached with
      // the board-independent profile.
      const watcher: Watcher = { ...profile, role };

      // Broadcast only on the user's first socket on the board; the joiner is
      // in the room the broadcast targets, so they receive the full list too.
      if (presenceRegistry.add(boardId, socket.id, watcher)) {
        emitBoardPresence(boardId, presenceRegistry.watchers(boardId));
      }
    });

    socket.on("board:leave", (payload) => {
      const { boardId } = payload;
      wantedBoards.delete(boardId);
      socket.leave(ROOMS.board(boardId));

      if (presenceRegistry.remove(boardId, socket.id, userId)) {
        emitBoardPresence(boardId, presenceRegistry.watchers(boardId));
      }
    });

    socket.on("workspace:join", async (payload) => {
      const { workspaceId } = payload;
      wantedWorkspaces.add(workspaceId);

      const canJoin = await canUserJoinWorkspace(userId, workspaceId);

      if (!canJoin) {
        if (socket.connected && wantedWorkspaces.has(workspaceId)) {
          socket.emit("workspace:error", { message: "Not authorized to join this workspace" });
        }
        return;
      }

      // Same race guard as board:join (F1): a workspace:leave processed during
      // the authz round-trip must cancel the join.
      if (!socket.connected || !wantedWorkspaces.has(workspaceId)) {
        wantedWorkspaces.delete(workspaceId);
        return;
      }

      socket.join(ROOMS.workspace(workspaceId));
    });

    socket.on("workspace:leave", (payload) => {
      const { workspaceId } = payload;
      wantedWorkspaces.delete(workspaceId);
      socket.leave(ROOMS.workspace(workspaceId));
    });

    socket.on("disconnect", () => {
      // Drop the socket from every board it viewed and refresh presence only
      // where the user actually left (last tab gone); uses the registry's
      // reverse index since `socket.rooms` is already cleared.
      for (const boardId of presenceRegistry.removeSocket(socket.id)) {
        emitBoardPresence(boardId, presenceRegistry.watchers(boardId));
      }
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  // In-process driver hitting the cron route every 15 minutes; no-op when
  // CRON_SECRET is unset (prod may use external cron instead).
  let reminderInterval: ReturnType<typeof setInterval> | null = null;

  if (process.env.CRON_SECRET) {
    const CRON_INTERVAL_MS = 15 * 60 * 1000;
    // F8: self-fetch targets 127.0.0.1 (IPv4 loopback) — `hostname` may be
    // "0.0.0.0" (not connectable) or resolve to ::1 while the server binds
    // IPv4-only; CRON_SELF_URL overrides for tunnels/load balancers.
    const appUrl = process.env.CRON_SELF_URL ?? `http://127.0.0.1:${port}`;

    reminderInterval = setInterval(async () => {
      try {
        const response = await fetch(`${appUrl}/api/cron/due-date-reminders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          console.error(`[due-date-scheduler] HTTP ${response.status} from cron route`);
        }
      } catch (error) {
        console.error("[due-date-scheduler] Failed to tick:", error);
      }
    }, CRON_INTERVAL_MS);

    console.log(`[due-date-scheduler] In-process driver started (interval=${CRON_INTERVAL_MS}ms)`);
  } else {
    console.log("[due-date-scheduler] CRON_SECRET unset — in-process driver disabled");
  }

  // Graceful shutdown (MEDIUM-2).
  const shutdown = () => {
    console.log("[server] Shutting down...");
    if (reminderInterval) {
      clearInterval(reminderInterval);
      reminderInterval = null;
    }
    io.close();
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
});
