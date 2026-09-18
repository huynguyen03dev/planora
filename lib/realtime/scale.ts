import { createAdapter } from "@socket.io/redis-adapter";
import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import type { Server } from "socket.io";

import type { ClientToServerEvents, ServerToClientEvents, Watcher } from "./types";

type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;

let commandClient: RedisClientType | null = null;
let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;
const pendingConnections = new WeakMap<object, Promise<RedisClientType>>();

function getPrefix(): string {
  return process.env.REDIS_KEY_PREFIX || "planora";
}

async function connect(client: RedisClientType): Promise<RedisClientType> {
  if (client.isOpen) return client;
  const existing = pendingConnections.get(client);
  if (existing) return existing;

  client.on("error", (error) => console.error("[redis]", error));
  const pending = client.connect().then(() => client);
  pendingConnections.set(client, pending);
  try {
    return await pending;
  } finally {
    pendingConnections.delete(client);
  }
}

export async function getRedis(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  commandClient ??= createClient({ url }) as RedisClientType;
  return connect(commandClient);
}

export async function configureRealtimeAdapter(io: RealtimeServer): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) return false;

  pubClient ??= createClient({ url }) as RedisClientType;
  subClient ??= pubClient.duplicate() as RedisClientType;
  try {
    await Promise.all([connect(pubClient), connect(subClient)]);
    io.adapter(createAdapter(pubClient, subClient));
    return true;
  } catch (error) {
    console.error("[realtime] Redis unavailable; using single-instance mode", error);
    await closeRealtimeScaleClients();
    return false;
  }
}

function boardKey(boardId: string): string {
  return `${getPrefix()}:presence:board:${boardId}`;
}

function socketKey(socketId: string): string {
  return `${getPrefix()}:presence:socket:${socketId}`;
}

export class SharedPresenceStore {
  async add(boardId: string, socketId: string, watcher: Watcher): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    await redis
      .multi()
      .hSet(boardKey(boardId), socketId, JSON.stringify(watcher))
      .sAdd(socketKey(socketId), boardId)
      .exec();
  }

  async remove(boardId: string, socketId: string): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    await redis
      .multi()
      .hDel(boardKey(boardId), socketId)
      .sRem(socketKey(socketId), boardId)
      .exec();
  }

  async removeSocket(socketId: string): Promise<string[]> {
    const redis = await getRedis();
    if (!redis) return [];

    const boards = await redis.sMembers(socketKey(socketId));
    if (boards.length === 0) return [];

    const tx = redis.multi();
    for (const boardId of boards) {
      tx.hDel(boardKey(boardId), socketId);
    }
    tx.del(socketKey(socketId));
    await tx.exec();
    return boards;
  }

  async watchers(boardId: string): Promise<Watcher[]> {
    const redis = await getRedis();
    if (!redis) return [];

    const rows = await redis.hVals(boardKey(boardId));
    const byUser = new Map<string, Watcher>();
    for (const row of rows) {
      const watcher = JSON.parse(row) as Watcher;
      byUser.set(watcher.id, watcher);
    }
    return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

export const sharedPresenceStore = new SharedPresenceStore();

export async function withDistributedLock<T>(
  name: string,
  ttlMs: number,
  task: () => Promise<T>,
): Promise<{ acquired: boolean; result?: T }> {
  const redis = await getRedis();
  if (!redis) return { acquired: true, result: await task() };

  const key = `${getPrefix()}:lock:${name}`;
  const token = randomUUID();
  const acquired = await redis.set(key, token, { NX: true, PX: ttlMs });
  if (!acquired) return { acquired: false };

  try {
    return { acquired: true, result: await task() };
  } finally {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [key], arguments: [token] },
    );
  }
}

export async function claimDistributedWindow(
  name: string,
  ttlMs: number,
): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return true;

  const key = `${getPrefix()}:window:${name}`;
  const acquired = await redis.set(key, randomUUID(), { NX: true, PX: ttlMs });
  return Boolean(acquired);
}

export async function closeRealtimeScaleClients(): Promise<void> {
  const clients = [commandClient, pubClient, subClient].filter(
    (client): client is RedisClientType => Boolean(client?.isOpen),
  );
  await Promise.all(clients.map((client) => client.quit()));
  commandClient = null;
  pubClient = null;
  subClient = null;
}
