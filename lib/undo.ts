/**
 * US-083 W8 — bounded undo: pure eligibility map + snackbar state machine.
 *
 * Decision 0031 fixes the undo bounds: exactly the two archive surfaces —
 * card archive and list archive — and nothing else. Permanent deletion,
 * member removal, rule/label deletion, and board/workspace deletion never
 * offer undo; they keep their existing confirm/audit semantics. The undo
 * mechanism is always the real restore Server Action for the archived row.
 */

export type UndoKind = "card" | "list";

export type UndoOffer = {
  kind: UndoKind;
  /** Entity id the restore action targets (cardId / listId) — supplied by
   *  the triggering call site, never derived from action result types. */
  id: string;
  /** Entity title from the triggering call site (a11y naming only). */
  label: string;
};

export type UndoPhase = "idle" | "offered" | "restoring" | "success" | "failure";

export type UndoState = {
  phase: UndoPhase;
  offer: UndoOffer | null;
  /** Polite success copy or the restore action's own error message. */
  message: string | null;
  /** Monotonic offer identity: OFFER bumps it; outcome actions carry it so a
   *  stale outcome from a replaced offer can never apply to a newer offer. */
  generation: number;
  /** Generation of the undo whose action result is still pending (null when
   *  nothing is in flight). While set, no new undo may start. */
  inFlightGeneration: number | null;
};

export type UndoAction =
  | { type: "OFFER"; offer: UndoOffer }
  | { type: "DISMISS" }
  | { type: "UNDO_START"; generation: number }
  | { type: "UNDO_OK"; generation: number; message: string }
  | { type: "UNDO_FAIL"; generation: number; message: string };

/** How long an archive offer stays actionable before it silently expires. */
export const UNDO_OFFER_TTL_MS = 8_000;
/** How long a successful restore status stays visible. */
export const UNDO_SUCCESS_TTL_MS = 4_000;

export const UNDO_INITIAL_STATE: UndoState = {
  phase: "idle",
  offer: null,
  message: null,
  generation: 0,
  inFlightGeneration: null,
};

/** Eligibility map — exactly card archive and list archive offer undo. */
const UNDO_ELIGIBLE_KINDS = new Set<UndoKind>(["card", "list"]);

export function isUndoEligible(kind: string): kind is UndoKind {
  return UNDO_ELIGIBLE_KINDS.has(kind as UndoKind);
}

/** Visible snackbar copy for the two eligible archive surfaces. */
export function archivedCopy(kind: UndoKind): string {
  return kind === "card" ? "Card archived" : "List archived";
}

export function restoredCopy(kind: UndoKind): string {
  return kind === "card" ? "Card restored" : "List restored";
}

/**
 * Latest offer wins: OFFER replaces any current state wholesale and bumps the
 * generation, so an outcome from a replaced offer is STALE and can never
 * overwrite the newer offer (the host restarts the TTL by keying its timer on
 * the offer identity). A stale outcome still clears the in-flight marker —
 * the running action is over — but touches nothing else.
 */
export function undoReducer(state: UndoState, action: UndoAction): UndoState {
  switch (action.type) {
    case "OFFER":
      return {
        phase: "offered",
        offer: action.offer,
        message: null,
        generation: state.generation + 1,
        inFlightGeneration: state.inFlightGeneration,
      };
    case "DISMISS":
      return UNDO_INITIAL_STATE;
    case "UNDO_START":
      return state.phase === "offered" &&
        state.offer !== null &&
        state.inFlightGeneration === null &&
        action.generation === state.generation
        ? { ...state, phase: "restoring", inFlightGeneration: action.generation }
        : state;
    case "UNDO_OK":
    case "UNDO_FAIL": {
      // The landing outcome ends the flight it belongs to — even when stale.
      const cleared =
        state.inFlightGeneration !== null && action.generation === state.inFlightGeneration
          ? { ...state, inFlightGeneration: null }
          : state;
      if (cleared.offer === null || action.generation !== cleared.generation) {
        // Stale outcome (offer dismissed or replaced): dropped entirely.
        return cleared;
      }
      return {
        ...cleared,
        phase: action.type === "UNDO_OK" ? "success" : "failure",
        message: action.message,
      };
    }
  }
}
