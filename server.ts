import { createServer } from "http";

import { parse } from "url";
import next from "next";

import { initIO } from "@/lib/realtime/server";
import { authenticateSocket, canUserJoinBoard, canUserJoinWorkspace } from "@/lib/realtime/auth";
import { ROOMS } from "@/lib/realtime/events";

type SocketData = { userId: string };

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

    socket.on("board:join", async (payload) => {
      const { boardId } = payload;
      const canJoin = await canUserJoinBoard(userId, boardId);

      if (!canJoin) {
        socket.emit("board:error", { message: "Not authorized to join this board" });
        return;
      }

      socket.join(ROOMS.board(boardId));
    });

    socket.on("board:leave", (payload) => {
      const { boardId } = payload;
      socket.leave(ROOMS.board(boardId));
    });

    socket.on("workspace:join", async (payload) => {
      const { workspaceId } = payload;
      const canJoin = await canUserJoinWorkspace(userId, workspaceId);

      if (!canJoin) {
        socket.emit("board:error", { message: "Not authorized to join this workspace" });
        return;
      }

      socket.join(ROOMS.workspace(workspaceId));
    });

    socket.on("workspace:leave", (payload) => {
      const { workspaceId } = payload;
      socket.leave(ROOMS.workspace(workspaceId));
    });

    socket.on("disconnect", () => {
      // Cleanup if needed
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  // ── Due-date reminder scheduler driver ───────────────────────────────
  // In-process setInterval that hits the cron route every 15 minutes.
  // No-op when CRON_SECRET is unset (prod may use external cron instead).
  let reminderInterval: ReturnType<typeof setInterval> | null = null;

  if (process.env.CRON_SECRET) {
    const CRON_INTERVAL_MS = 15 * 60 * 1000;
    const appUrl = `http://${hostname}:${port}`;

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

  // ── Graceful shutdown (MEDIUM-2) ────────────────────────────────────
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
