import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

import { Server } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";

const CLIENTS = Number(process.env.PERF_SOCKET_CLIENTS ?? 25);
const EVENTS = Number(process.env.PERF_SOCKET_EVENTS ?? 500);
const CONNECT_P95_LIMIT_MS = Number(process.env.PERF_SOCKET_CONNECT_P95_MS ?? 1_000);
const THROUGHPUT_MIN = Number(process.env.PERF_SOCKET_MIN_MSG_S ?? 1_000);
const RSS_DELTA_LIMIT_MB = Number(process.env.PERF_SOCKET_RSS_MAX_MB ?? 128);

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

async function main() {
  const rssBefore = process.memoryUsage().rss;
  const httpServer = createServer();
  const io = new Server(httpServer, { transports: ["websocket"] });

  io.on("connection", (socket) => {
    socket.join("bench");
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("No benchmark port");
  const url = "http://127.0.0.1:" + address.port;

  const sockets: Socket[] = [];
  const connectTimes: number[] = [];
  await Promise.all(
    Array.from({ length: CLIENTS }, async () => {
      const started = performance.now();
      const socket = createClient(url, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => {
          connectTimes.push(performance.now() - started);
          resolve();
        });
        socket.once("connect_error", reject);
      });
    }),
  );

  let received = 0;
  let finish!: () => void;
  const completed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  for (const socket of sockets) {
    socket.on("bench:event", () => {
      received += 1;
      if (received === CLIENTS * EVENTS) finish();
    });
  }

  const startedEvents = performance.now();
  for (let i = 0; i < EVENTS; i += 1) {
    io.to("bench").emit("bench:event", { sequence: i });
  }
  await Promise.race([
    completed,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Realtime benchmark timed out")), 15_000),
    ),
  ]);
  const eventMs = performance.now() - startedEvents;
  const throughput = (received / eventMs) * 1_000;
  const connectP95 = percentile(connectTimes, 0.95);
  const rssDeltaMb = (process.memoryUsage().rss - rssBefore) / 1024 / 1024;

  const results = [
    { metric: "socket clients", value: CLIENTS, limit: "configured load", pass: true },
    {
      metric: "connect p95",
      value: connectP95.toFixed(1) + " ms",
      limit: "<= " + CONNECT_P95_LIMIT_MS + " ms",
      pass: connectP95 <= CONNECT_P95_LIMIT_MS,
    },
    {
      metric: "event deliveries",
      value: received,
      limit: CLIENTS + " x " + EVENTS,
      pass: received === CLIENTS * EVENTS,
    },
    {
      metric: "delivery throughput",
      value: throughput.toFixed(0) + " msg/s",
      limit: ">= " + THROUGHPUT_MIN + " msg/s",
      pass: throughput >= THROUGHPUT_MIN,
    },
    {
      metric: "RSS delta",
      value: rssDeltaMb.toFixed(1) + " MB",
      limit: "<= " + RSS_DELTA_LIMIT_MB + " MB",
      pass: rssDeltaMb <= RSS_DELTA_LIMIT_MB,
    },
  ];

  console.table(results);

  for (const socket of sockets) socket.disconnect();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));

  process.exit(results.every((result) => result.pass) ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
