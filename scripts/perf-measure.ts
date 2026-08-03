#!/usr/bin/env tsx
/**
 * DnD INP-vs-board-size measurement (US-027 need-assessment — local only).
 *
 * Signs up a fresh user against a PROD server, seeds boards at several card
 * counts, and for each one drives the @hello-pangea/dnd keyboard sensor through
 * the US-004 sequence (lift -> 3x move within list -> cross to next list ->
 * drop) while capturing the Event Timing API entries the INP metric is derived
 * from. Reports the worst interaction (== INP) per board, median of N runs.
 *
 * Prereq: a prod server on $BASE (default :3100) whose Better Auth origin
 * matches $BASE. Usage: npx tsx --env-file=.env scripts/perf-measure.ts
 */
import { execSync } from "node:child_process";

import { chromium, type Page } from "@playwright/test";

import { signUp, liftCard, moveLifted, dropCard } from "../e2e/helpers/app";

const BASE = process.env.PERF_BASE ?? "http://localhost:3100";
const SIZES = [30, 60, 100, 150];
const RUNS = 3;
// CPU throttle multiplier: 1 = this desktop, 4 ≈ mid-tier laptop, 6 ≈ phone.
const CPU = parseInt(process.env.PERF_CPU ?? "1", 10);

type Interaction = { name: string; dur: number };

async function installInpObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __inp: { entries: Interaction[]; max: number };
    };
    w.__inp = { entries: [], max: 0 };
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as Array<
        PerformanceEventTiming & { interactionId?: number }
      >) {
        if (e.interactionId && e.interactionId > 0) {
          w.__inp.entries.push({ name: e.name, dur: e.duration });
          if (e.duration > w.__inp.max) w.__inp.max = e.duration;
        }
      }
    });
    po.observe({ type: "event", durationThreshold: 0, buffered: true } as PerformanceObserverInit);
  });
}

async function readInp(page: Page): Promise<{ max: number; entries: Interaction[] }> {
  // Give the observer a tick to flush the last interaction's entry.
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const w = window as unknown as { __inp: { entries: Interaction[]; max: number } };
    return w.__inp;
  });
}

/** One full drag session; returns the worst interaction latency + breakdown. */
async function measureDrag(page: Page): Promise<{ max: number; entries: Interaction[] }> {
  // First CARD drag handle (lists also have handles; scope by aria-label).
  const cardHandle = page.getByRole("button", { name: "Drag card" }).first();
  await cardHandle.waitFor({ state: "visible", timeout: 15_000 });
  const cardId = await cardHandle.getAttribute("data-rfd-drag-handle-draggable-id");
  if (!cardId) throw new Error("no card drag handle id");

  await installInpObserver(page);

  await liftCard(page, cardId);
  await moveLifted(page, "ArrowDown");
  await moveLifted(page, "ArrowDown");
  await moveLifted(page, "ArrowDown");
  await moveLifted(page, "ArrowRight"); // cross into next list
  await dropCard(page);

  return readInp(page);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
  const stamp = Date.now();
  const creds = {
    name: "Perf Profiler",
    email: `perf-${stamp}@planora.test`,
    password: "perf-Password-123",
  };

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  console.log(`Signing up ${creds.email} against ${BASE} ...`);
  await signUp(page, creds);

  // Seed each sized board now that the user exists.
  const boards: Record<number, string> = {};
  for (const size of SIZES) {
    const out = execSync(
      `npx tsx --env-file=.env scripts/seed-perf-board.ts --email ${creds.email} --cards ${size} --lists 5 --rich --slug perf-${stamp}-${size}`,
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const id = out.match(/BOARD_ID=([0-9a-f-]+)/)?.[1];
    if (!id) throw new Error(`seed failed for size ${size}: ${out}`);
    boards[size] = id;
    console.log(`  seeded ${size} cards -> board ${id}`);
  }

  // Throttle only the measured drags (signup/seed above ran unthrottled).
  if (CPU > 1) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  }
  console.log(`CPU throttle: ${CPU}x`);

  const results: Array<{ size: number; runs: number[]; median: number }> = [];
  for (const size of SIZES) {
    const runs: number[] = [];
    let worst: { max: number; entries: Interaction[] } = { max: 0, entries: [] };
    for (let r = 0; r < RUNS; r++) {
      await page.goto(`/boards/${boards[size]}`, { waitUntil: "networkidle" });
      const inp = await measureDrag(page);
      runs.push(Math.round(inp.max));
      if (inp.max > worst.max) worst = inp;
    }
    results.push({ size, runs, median: Math.round(median(runs)) });
    console.log(`size ${size}: runs=[${runs.join(", ")}] median=${median(runs)}ms`);
    console.log(
      `  worst-run interactions: ${worst.entries.map((e) => `${e.name}=${Math.round(e.dur)}`).join("  ")}`,
    );
  }

  console.log("\n========== INP vs board size (prod, no CPU throttle) ==========");
  console.log("cards | 5 lists | runs (ms)            | median INP | band");
  console.log("------|---------|---------------------|------------|------");
  for (const { size, runs, median: med } of results) {
    const band = med <= 200 ? "GOOD" : med <= 500 ? "needs-improvement" : "POOR";
    console.log(
      `${String(size).padEnd(5)} |    ${size / 5}    | ${runs.join(", ").padEnd(19)} | ${String(med).padEnd(10)} | ${band}`,
    );
  }

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
