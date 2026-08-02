"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { usePathname } from "next/navigation";

import {
  restoreCardAction,
  restoreListAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { Button } from "@/components/ui/button";
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

type UndoContextValue = {
  /** Offer an undo after an archive action succeeded. Identifiers come from
   *  the triggering call site (decision 0031) — never from expanding archive
   *  result types. Outside a mounted UndoHost this is a no-op. */
  offerUndo: (offer: UndoOffer) => void;
};

// Default no-op context: the archive seams are shared components that also
// render where no host is mounted. Undo is a board-level affordance (mounted
// in the board page); without the host the offer is simply dropped.
const UndoContext = createContext<UndoContextValue>({ offerUndo: () => {} });

export function useUndo(): UndoContextValue {
  return useContext(UndoContext);
}

function genericFailureCopy(kind: UndoOffer["kind"]): string {
  return kind === "card"
    ? "Couldn't restore the card. Please try again."
    : "Couldn't restore the list. Please try again.";
}

/**
 * US-083 W8 — bounded undo host. One state machine per board, mounted at the
 * board/provider level (board page, inside BoardStoreProvider) so it outlives
 * the archived entity's unmount and survives realtime/RSC re-renders. The
 * snackbar is transient feedback (DESIGN.md): polite `role="status"` on offer
 * and success, assertive `role="alert"` on failure, no focus steal, no
 * app-wide toast framework. Undo calls the real restore Server Actions —
 * pessimistic: their result is the source of truth, never an optimistic
 * local restore.
 */
export function UndoHost({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(undoReducer, UNDO_INITIAL_STATE);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  // Navigation dismissal: any active offer/feedback clears on route change.
  useEffect(() => {
    if (pathname !== pathnameRef.current) {
      pathnameRef.current = pathname;
      dispatch({ type: "DISMISS" });
    }
  }, [pathname]);

  // Offers expire after the TTL; successes self-dismiss. Keying on the offer
  // identity restarts the clock for "latest offer wins".
  useEffect(() => {
    if (state.phase === "offered") {
      const timer = setTimeout(() => dispatch({ type: "DISMISS" }), UNDO_OFFER_TTL_MS);
      return () => clearTimeout(timer);
    }
    if (state.phase === "success") {
      const timer = setTimeout(() => dispatch({ type: "DISMISS" }), UNDO_SUCCESS_TTL_MS);
      return () => clearTimeout(timer);
    }
  }, [state.phase, state.offer]);

  const offerUndo = useCallback((offer: UndoOffer) => {
    // Eligibility is exactly card/list archive (decision 0031); the call sites
    // are the structural gate, this guard is the defensive backstop.
    if (!isUndoEligible(offer.kind)) {
      return;
    }
    dispatch({ type: "OFFER", offer });
  }, []);

  const contextValue = useMemo(() => ({ offerUndo }), [offerUndo]);

  async function handleUndo() {
    // Capture the offer identity (generation) at click time: the outcome
    // dispatches are tagged with it, so if a newer offer replaces this one
    // while the action is in flight, the reducer drops the stale outcome.
    const { offer, generation, phase, inFlightGeneration } = state;
    if (!offer || phase !== "offered" || inFlightGeneration !== null) {
      return;
    }
    dispatch({ type: "UNDO_START", generation });
    const formData = new FormData();
    formData.set(offer.kind === "card" ? "cardId" : "listId", offer.id);
    try {
      const result =
        offer.kind === "card"
          ? await restoreCardAction(formData)
          : await restoreListAction(formData);
      if (result.success) {
        dispatch({ type: "UNDO_OK", generation, message: restoredCopy(offer.kind) });
      } else {
        // The action's own error (e.g. "Restore the list first.") — truthful,
        // never string-swapped at the UI layer.
        dispatch({ type: "UNDO_FAIL", generation, message: result.error });
      }
    } catch {
      // A thrown action must never leave the UI stuck in "Restoring…".
      dispatch({ type: "UNDO_FAIL", generation, message: genericFailureCopy(offer.kind) });
    }
  }

  const offer = state.offer;
  const showSnackbar = state.phase !== "idle" && offer !== null;

  return (
    <UndoContext.Provider value={contextValue}>
      {children}
      {showSnackbar ? (
        <div
          role={state.phase === "failure" ? "alert" : "status"}
          className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg"
        >
          {state.phase === "success" || state.phase === "failure" ? (
            <>
              <span className="text-sm text-foreground">{state.message}</span>
              {state.phase === "failure" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: "DISMISS" })}
                  aria-label="Dismiss"
                  className="shrink-0"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <span className="text-sm text-foreground">{archivedCopy(offer.kind)}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={state.phase === "restoring" || state.inFlightGeneration !== null}
                aria-label={`Undo archive of ${offer.label}`}
                className="shrink-0"
              >
                {state.phase === "restoring" ? "Restoring…" : "Undo"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: "DISMISS" })}
                disabled={state.phase === "restoring"}
                aria-label="Dismiss"
                className="shrink-0"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
              </Button>
            </>
          )}
        </div>
      ) : null}
    </UndoContext.Provider>
  );
}
