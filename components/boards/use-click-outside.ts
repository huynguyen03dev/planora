"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Dismiss an inline composer (add-card / add-list) when a pointer-down lands
 * outside it. Spread the returned props onto the composer's root element:
 *
 *   const outside = useClickOutside(open, close);
 *   return <form {...outside}>…</form>;
 *
 * Containment is checked with `target.closest([data-attr])` rather than
 * `ref.contains(target)` on purpose: the latter compares node identity, which
 * is unreliable under the happy-dom test environment, whereas `closest` walks
 * the real ancestor chain. A per-instance `useId` scopes the match to this
 * composer so sibling composers don't swallow each other's outside-clicks.
 * The listener is only attached while `enabled` is true.
 */
export function useClickOutside(
  enabled: boolean,
  handler: () => void,
): { "data-click-outside": string } {
  const id = useId();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(`[data-click-outside="${id}"]`)
      ) {
        return;
      }
      handlerRef.current();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [enabled, id]);

  return { "data-click-outside": id };
}
