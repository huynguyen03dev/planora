import { describe, expect, it } from "vitest";

import {
  UNDO_INITIAL_STATE,
  UNDO_OFFER_TTL_MS,
  UNDO_SUCCESS_TTL_MS,
  archivedCopy,
  isUndoEligible,
  restoredCopy,
  undoReducer,
  type UndoOffer,
} from "@/lib/undo";

/**
 * US-083 W8 — bounded undo: eligibility map + snackbar state machine (pure).
 * Decision 0031 fixes the undo bounds: exactly card archive and list archive.
 * Every non-goal flow (permanent delete, member removal, rule/label deletion,
 * board/workspace deletion) must never offer undo.
 */
describe("US-083 W8 — undo eligibility (decision 0031)", () => {
  it("is eligible for exactly card archive and list archive", () => {
    expect(isUndoEligible("card")).toBe(true);
    expect(isUndoEligible("list")).toBe(true);
  });

  it("is NOT eligible for any non-goal or unknown flow", () => {
    // Decision 0031 non-goals — and anything that is not one of the two kinds.
    const nonGoals = [
      "permanent-delete",
      "member-removal",
      "rule-delete",
      "label-delete",
      "board-delete",
      "workspace-delete",
      "comment",
      "attachment",
      "capture",
      "",
    ];
    for (const kind of nonGoals) {
      expect(isUndoEligible(kind), `kind "${kind}" must not be undo-eligible`).toBe(false);
    }
  });

  it("acts as a type guard narrowing the kind", () => {
    const kind: string = "card";
    if (isUndoEligible(kind)) {
      // Compile-time narrowing: inside this block `kind` is UndoKind.
      expect(["card", "list"]).toContain(kind);
    }
  });
});

describe("US-083 W8 — snackbar copy", () => {
  it("card/list copy says archived (offer) and restored (success)", () => {
    expect(archivedCopy("card")).toBe("Card archived");
    expect(archivedCopy("list")).toBe("List archived");
    expect(restoredCopy("card")).toBe("Card restored");
    expect(restoredCopy("list")).toBe("List restored");
  });
});

describe("US-083 W8 — snackbar state machine", () => {
  const cardOffer: UndoOffer = { kind: "card", id: "card-1", label: "Card one" };
  const listOffer: UndoOffer = { kind: "list", id: "list-1", label: "List one" };

  it("starts idle", () => {
    expect(UNDO_INITIAL_STATE).toEqual({
      phase: "idle",
      offer: null,
      message: null,
      generation: 0,
      inFlightGeneration: null,
    });
  });

  it("OFFER enters the offered phase carrying the triggering call-site id and a fresh generation", () => {
    const s = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    expect(s.phase).toBe("offered");
    expect(s.offer).toEqual(cardOffer);
    expect(s.message).toBeNull();
    expect(s.generation).toBe(1);
    expect(s.inFlightGeneration).toBeNull();
  });

  it("latest offer wins: a second OFFER replaces the first wholesale and bumps the generation", () => {
    let s = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    s = undoReducer(s, { type: "OFFER", offer: listOffer });
    expect(s.phase).toBe("offered");
    expect(s.offer).toEqual(listOffer);
    expect(s.message).toBeNull();
    expect(s.generation).toBe(2);
  });

  it("DISMISS returns to idle from offered, restoring, and failure phases", () => {
    let s = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    expect(undoReducer(s, { type: "DISMISS" })).toEqual(UNDO_INITIAL_STATE);

    s = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    s = undoReducer(s, { type: "UNDO_START", generation: 1 });
    expect(undoReducer(s, { type: "DISMISS" })).toEqual(UNDO_INITIAL_STATE);

    s = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    s = undoReducer(s, { type: "UNDO_START", generation: 1 });
    s = undoReducer(s, {
      type: "UNDO_FAIL",
      generation: 1,
      message: "Restore the list first.",
    });
    expect(undoReducer(s, { type: "DISMISS" })).toEqual(UNDO_INITIAL_STATE);
  });

  it("UNDO_START is only honored from the offered phase with the current generation (never while idle)", () => {
    expect(undoReducer(UNDO_INITIAL_STATE, { type: "UNDO_START", generation: 0 })).toEqual(
      UNDO_INITIAL_STATE,
    );
    // A stale generation can never start an undo for the current offer.
    const offered = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    expect(undoReducer(offered, { type: "UNDO_START", generation: 0 })).toEqual(offered);

    const restoring = undoReducer(offered, { type: "UNDO_START", generation: 1 });
    expect(restoring.phase).toBe("restoring");
    expect(restoring.offer).toEqual(cardOffer);
    expect(restoring.inFlightGeneration).toBe(1);
  });

  it("UNDO_OK lands on polite success with the restore copy", () => {
    const offered = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    const ok = undoReducer(offered, { type: "UNDO_OK", generation: 1, message: "Card restored" });
    expect(ok.phase).toBe("success");
    expect(ok.message).toBe("Card restored");
    expect(ok.offer).toEqual(cardOffer);
    expect(ok.inFlightGeneration).toBeNull();
  });

  it("UNDO_FAIL lands on assertive failure with the action's own error", () => {
    const offered = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    const fail = undoReducer(offered, {
      type: "UNDO_FAIL",
      generation: 1,
      message: "Restore the list first.",
    });
    expect(fail.phase).toBe("failure");
    expect(fail.message).toBe("Restore the list first.");
    expect(fail.offer).toEqual(cardOffer);
  });

  it("late async outcomes cannot resurrect a dismissed snackbar", () => {
    const offered = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    const dismissed = undoReducer(offered, { type: "DISMISS" });
    expect(
      undoReducer(dismissed, { type: "UNDO_OK", generation: 1, message: "Card restored" }),
    ).toEqual(UNDO_INITIAL_STATE);
    expect(
      undoReducer(dismissed, { type: "UNDO_FAIL", generation: 1, message: "nope" }),
    ).toEqual(UNDO_INITIAL_STATE);
  });

  it("pins the TTL constants the host timers rely on", () => {
    expect(UNDO_OFFER_TTL_MS).toBe(8000);
    expect(UNDO_SUCCESS_TTL_MS).toBe(4000);
  });

  it("a stale success from a replaced offer cannot overwrite the newer offer", () => {
    // A (card) starts restoring; B (list) is offered while A's action is
    // still in flight; A resolves success. B must REMAIN offered with its own
    // Undo intact — the stale outcome is dropped, not applied to B.
    let s = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    s = undoReducer(s, { type: "UNDO_START", generation: 1 });
    s = undoReducer(s, { type: "OFFER", offer: listOffer });
    s = undoReducer(s, { type: "UNDO_OK", generation: 1, message: "Card restored" });

    expect(s.phase).toBe("offered");
    expect(s.offer).toEqual(listOffer);
    expect(s.message).toBeNull();
    // The stale outcome still ended A's flight; B's offer is untouched.
    expect(s.generation).toBe(2);
    expect(s.inFlightGeneration).toBeNull();
  });

  it("a stale failure from a replaced offer cannot overwrite the newer offer", () => {
    let s = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    s = undoReducer(s, { type: "UNDO_START", generation: 1 });
    s = undoReducer(s, { type: "OFFER", offer: listOffer });
    s = undoReducer(s, {
      type: "UNDO_FAIL",
      generation: 1,
      message: "Restore the list first.",
    });

    expect(s.phase).toBe("offered");
    expect(s.offer).toEqual(listOffer);
    expect(s.message).toBeNull();
    expect(s.generation).toBe(2);
    expect(s.inFlightGeneration).toBeNull();
  });

  it("a newer offer's undo cannot start while the previous undo is in flight; it works after the stale outcome clears the flight", () => {
    let s = undoReducer(UNDO_INITIAL_STATE, { type: "OFFER", offer: cardOffer });
    s = undoReducer(s, { type: "UNDO_START", generation: 1 });
    s = undoReducer(s, { type: "OFFER", offer: listOffer });

    // B's undo is blocked while A's action is still pending...
    const blocked = undoReducer(s, { type: "UNDO_START", generation: 2 });
    expect(blocked).toEqual(s);
    expect(blocked.inFlightGeneration).toBe(1);

    // ...A's stale success lands (dropped, but clears the flight)...
    s = undoReducer(blocked, { type: "UNDO_OK", generation: 1, message: "Card restored" });
    expect(s.phase).toBe("offered");
    expect(s.offer).toEqual(listOffer);
    expect(s.inFlightGeneration).toBeNull();

    // ...and B's undo now starts and completes normally.
    s = undoReducer(s, { type: "UNDO_START", generation: 2 });
    expect(s.phase).toBe("restoring");
    s = undoReducer(s, { type: "UNDO_OK", generation: 2, message: "List restored" });
    expect(s.phase).toBe("success");
    expect(s.message).toBe("List restored");
    expect(s.offer).toEqual(listOffer);
  });
});
