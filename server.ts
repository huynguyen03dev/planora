import { createServer } from "http";

import { parse } from "url";
import next from "next";

import { initIO } from "@/lib/realtime/server";
import { authenticateSocket, canUserJoinBoard } from "@/lib/realtime/auth";
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

    socket.on("disconnect", () => {
      // Cleanup if needed
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
