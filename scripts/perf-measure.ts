#!/usr/bin/env tsx
/**
 * DnD INP-vs-board-size measurement (US-027 need-assessment — local only).
 * Signs up a fresh user against a PROD server, seeds boards at several card
 * counts, and drives the @hello-pangea/dnd keyboard sensor through the US-004
 * lift -> move -> drop sequence while capturing Event Timing entries;
 * reports the worst interaction (== INP) per board, median of N runs.
 * Prereq: a prod server on $BASE (default :3100) with matching Better Auth origin.
 * Usage: npx tsx --env-file=.env scripts/perf-measure.ts
 */
import { execSync } from "node:child_process";

import { chromium, type Page } from "@playwright/test";

import { signUp, liftCard, moveLifted, dropCard } from "../e2e/helpers/app";

const BASE = process.env.PERF_BASE ?? "http://localhost:3100";
const SIZES = [30, 60, 100, 150];
const RUNS = 3;
// CPU throttle multiplier: 1 = this desktop, 4 ≈ mid-tier laptop, 6 ≈ phone.
const CPU = parseInt(process.env.PERF_CPU ?? "1", 10);
const INP_LIMIT_MS = parseInt(process.env.PERF_INP_MAX_MS ?? "500", 10);
const LOAD_LIMIT_MS = parseInt(process.env.PERF_LOAD_MAX_MS ?? "3000", 10);

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

async function readNavigationMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return entry?.duration ?? 0;
  });
}

async function measureDrag(page: Page): Promise<{ max: number; entries: Interaction[] }> {
  // The whole card body is the drag handle (lists also have handles). Its
  // accessible name is the card-open label, not a separate "Drag card" grip.
  const cardHandle = page.getByRole("button", { name: /^Open card / }).first();
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
      // Inherit the benchmark process environment. Passing --env-file here
      // would overwrite an explicit DATABASE_URL used for an isolated test DB.
      `npx tsx scripts/seed-perf-board.ts --email ${creds.email} --cards ${size} --lists 5 --rich --slug perf-${stamp}-${size}`,
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

  const results: Array<{
    size: number;
    inpRuns: number[];
    loadRuns: number[];
    medianInp: number;
    medianLoad: number;
  }> = [];
  for (const size of SIZES) {
    const inpRuns: number[] = [];
    const loadRuns: number[] = [];
    let worst: { max: number; entries: Interaction[] } = { max: 0, entries: [] };
    for (let r = 0; r < RUNS; r++) {
      await page.goto(`/boards/${boards[size]}`, { waitUntil: "networkidle" });
      loadRuns.push(Math.round(await readNavigationMs(page)));
      const inp = await measureDrag(page);
      inpRuns.push(Math.round(inp.max));
      if (inp.max > worst.max) worst = inp;
    }
    const medianInp = Math.round(median(inpRuns));
    const medianLoad = Math.round(median(loadRuns));
    results.push({ size, inpRuns, loadRuns, medianInp, medianLoad });
    console.log(
      `size ${size}: INP=[${inpRuns.join(", ")}] median=${medianInp}ms; load=[${loadRuns.join(", ")}] median=${medianLoad}ms`,
    );
    console.log(
      `  worst-run interactions: ${worst.entries.map((e) => `${e.name}=${Math.round(e.dur)}`).join("  ")}`,
    );
  }

  console.log(`\n========== Planora board benchmark (CPU throttle ${CPU}x) ==========`);
  console.log(`Thresholds: median INP <= ${INP_LIMIT_MS}ms; median board load <= ${LOAD_LIMIT_MS}ms`);
  console.log("cards | median INP | median load | result");
  console.log("------|------------|-------------|-------");
  for (const { size, medianInp, medianLoad } of results) {
    const pass = medianInp <= INP_LIMIT_MS && medianLoad <= LOAD_LIMIT_MS;
    console.log(
      `${String(size).padEnd(5)} | ${String(medianInp).padEnd(10)} | ${String(medianLoad).padEnd(11)} | ${pass ? "PASS" : "FAIL"}`,
    );
  }

  await browser.close();
  const failed = results.some(
    ({ medianInp, medianLoad }) => medianInp > INP_LIMIT_MS || medianLoad > LOAD_LIMIT_MS,
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
