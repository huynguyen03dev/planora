import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  claimDistributedWindow,
  closeRealtimeScaleClients,
  getRedis,
  SharedPresenceStore,
  withDistributedLock,
} from "@/lib/realtime/scale";
import type { Watcher } from "@/lib/realtime/types";

const enabled = Boolean(process.env.REDIS_URL);
const suite = enabled ? describe : describe.skip;

suite("Redis multi-instance coordination proof", () => {
  beforeEach(async () => {
    const redis = await getRedis();
    const keys = (await redis?.keys("planora:test:*")) ?? [];
    if (keys.length) await redis?.del(keys);
    process.env.REDIS_KEY_PREFIX = "planora:test";
  });

  afterAll(async () => {
    const redis = await getRedis();
    const keys = (await redis?.keys("planora:test:*")) ?? [];
    if (keys.length) await redis?.del(keys);
    await closeRealtimeScaleClients();
  });

  it("shares presence across store instances and dedupes multiple sockets for one user", async () => {
    const a = new SharedPresenceStore();
    const b = new SharedPresenceStore();
    const alice: Watcher = { id: "alice", name: "Alice", image: null, role: "admin" };
    const bob: Watcher = { id: "bob", name: "Bob", image: null, role: "editor" };

    await a.add("board-1", "socket-a1", alice);
    await b.add("board-1", "socket-a2", alice);
    await b.add("board-1", "socket-b1", bob);

    expect(await a.watchers("board-1")).toEqual([alice, bob]);

    await a.remove("board-1", "socket-a1");
    expect(await b.watchers("board-1")).toEqual([alice, bob]);

    await b.removeSocket("socket-a2");
    expect(await a.watchers("board-1")).toEqual([bob]);
  });

  it("allows only one scheduler claim inside a distributed window", async () => {
    const [first, second] = await Promise.all([
      claimDistributedWindow("cron-proof", 5_000),
      claimDistributedWindow("cron-proof", 5_000),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("serializes a distributed lock and releases it after the holder finishes", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = withDistributedLock("lock-proof", 5_000, async () => {
      await held;
      return "first";
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = await withDistributedLock("lock-proof", 5_000, async () => "second");
    expect(second.acquired).toBe(false);

    release();
    expect((await first).result).toBe("first");

    const third = await withDistributedLock("lock-proof", 5_000, async () => "third");
    expect(third).toEqual({ acquired: true, result: "third" });
  });
});
