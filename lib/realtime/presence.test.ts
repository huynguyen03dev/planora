import { describe, expect, it } from "vitest";

import { PresenceRegistry } from "./presence";
import type { Watcher } from "./types";

const alice: Watcher = { id: "u-alice", name: "Alice", image: null, role: "admin" };
const bob: Watcher = { id: "u-bob", name: "Bob", image: "https://img/bob", role: "editor" };

describe("PresenceRegistry", () => {
  it("adds a watcher and reports a visible change", () => {
    const r = new PresenceRegistry();
    expect(r.add("b1", "s1", alice)).toBe(true);
    expect(r.watchers("b1")).toEqual([alice]);
  });

  it("dedupes multiple tabs of the same user into one avatar", () => {
    const r = new PresenceRegistry();
    expect(r.add("b1", "s1", alice)).toBe(true);
    expect(r.add("b1", "s2", alice)).toBe(false); // second tab: no visible change
    expect(r.watchers("b1")).toEqual([alice]);
  });

  it("keeps the user present until the last tab leaves", () => {
    const r = new PresenceRegistry();
    r.add("b1", "s1", alice);
    r.add("b1", "s2", alice);

    expect(r.remove("b1", "s1", alice.id)).toBe(false); // still has s2
    expect(r.watchers("b1")).toEqual([alice]);
    expect(r.remove("b1", "s2", alice.id)).toBe(true); // last tab gone
    expect(r.watchers("b1")).toEqual([]);
  });

  it("returns watchers sorted by name for stable ordering", () => {
    const r = new PresenceRegistry();
    r.add("b1", "s2", bob);
    r.add("b1", "s1", alice);
    expect(r.watchers("b1")).toEqual([alice, bob]);
  });

  it("removeSocket drops the user from every board it was viewing", () => {
    const r = new PresenceRegistry();
    r.add("b1", "s1", alice);
    r.add("b2", "s1", alice); // same socket viewing two boards
    r.add("b2", "s9", bob); // someone else also on b2

    const affected = r.removeSocket("s1");
    expect(affected.sort()).toEqual(["b1", "b2"]);
    expect(r.watchers("b1")).toEqual([]);
    expect(r.watchers("b2")).toEqual([bob]);
  });

  it("removeSocket only reports boards where the user actually dropped off", () => {
    const r = new PresenceRegistry();
    r.add("b1", "s1", alice);
    r.add("b1", "s2", alice); // alice has a second tab on b1

    // Closing s1 should NOT report b1 as changed — s2 keeps her present.
    expect(r.removeSocket("s1")).toEqual([]);
    expect(r.watchers("b1")).toEqual([alice]);
  });

  it("is idempotent for unknown keys", () => {
    const r = new PresenceRegistry();
    expect(r.remove("nope", "nope", "nope")).toBe(false);
    expect(r.removeSocket("nope")).toEqual([]);
    expect(r.watchers("nope")).toEqual([]);
  });

  it("survives a leave then a disconnect for the same socket (no double-remove throw)", () => {
    const r = new PresenceRegistry();
    r.add("b1", "s1", alice);

    expect(r.remove("b1", "s1", alice.id)).toBe(true);
    expect(r.removeSocket("s1")).toEqual([]); // socket already pruned
    expect(r.watchers("b1")).toEqual([]);
  });

  it("keeps the user present through a reconnect (new socket added before old removed)", () => {
    const r = new PresenceRegistry();
    r.add("b1", "s-old", alice);

    // Reconnect: the new socket joins before the old one's disconnect lands.
    expect(r.add("b1", "s-new", alice)).toBe(false); // already present, no flicker
    expect(r.removeSocket("s-old")).toEqual([]); // old socket gone, but s-new keeps her
    expect(r.watchers("b1")).toEqual([alice]);
  });
});
