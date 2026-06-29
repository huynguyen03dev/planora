"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react-dom";

import { getCaretCoordinates } from "@/lib/caret-coordinates";
import type { AssignableWorkspaceMemberRecord } from "@/lib/card-member";
import { extractMentionQuery, mentionMatchesName } from "@/lib/mention";

type UseMentionAutocompleteArgs = {
  members: AssignableWorkspaceMemberRecord[];
  value: string;
  /** Update the textarea value (callers also clear validation errors here). */
  setValue: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

const MAX_DROPDOWN_HEIGHT = 240;

/**
 * Accessible @mention autocomplete for a <textarea>.
 *
 * Positioning uses Floating UI with a virtual reference element placed at the
 * caret (so the list flips/shifts to stay on-screen and follows scroll/resize),
 * and the list is meant to be portaled to <body> by the caller so a transformed
 * dialog ancestor can't break fixed positioning or clip the popup. Focus stays
 * in the textarea throughout — Floating UI's positioning layer does not trap
 * focus, which is why this is preferable to wrapping the list in a Popover.
 */
export function useMentionAutocomplete({
  members,
  value,
  setValue,
  textareaRef,
}: UseMentionAutocompleteArgs) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [startIndex, setStartIndex] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const listboxId = useId();
  const caretRect = useRef({ x: 0, y: 0, height: 0 });

  const { refs, floatingStyles, update } = useFloating({
    open,
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [
      // Gap between the caret line and the dropdown.
      offset(7),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.min(
            availableHeight,
            MAX_DROPDOWN_HEIGHT,
          )}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  // Stable virtual reference: a zero-width box at the caret, read live so
  // re-positioning never needs a new object identity.
  const virtualReference = useRef({
    getBoundingClientRect() {
      const { x, y, height } = caretRect.current;
      return {
        x,
        y,
        left: x,
        top: y,
        right: x,
        bottom: y + height,
        width: 0,
        height,
      };
    },
  });

  const items = useMemo(
    () =>
      open
        ? members.filter(
            (member) => query === "" || mentionMatchesName(query, member.name),
          )
        : [],
    [open, members, query],
  );

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    setValue(next);

    const caretPos = event.target.selectionStart ?? next.length;
    const mention = extractMentionQuery(next, caretPos);
    if (!mention) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setQuery(mention.query);
    setStartIndex(mention.startIndex);
    setActiveIndex(0);

    const textarea = event.target;
    const caret = getCaretCoordinates(textarea, mention.startIndex);
    const rect = textarea.getBoundingClientRect();
    caretRect.current = {
      x: rect.left + caret.left - textarea.scrollLeft,
      y: rect.top + caret.top - textarea.scrollTop,
      height: caret.lineHeight,
    };
    refs.setReference(virtualReference.current);
    update();
  }

  function selectMember(member: AssignableWorkspaceMemberRecord) {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, startIndex);
    const after = value.slice(cursor);
    const next = `${before}@${member.name} ${after}`;
    setValue(next);
    setOpen(false);

    const caretPos = before.length + member.name.length + 2; // '@' + name + ' '
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(caretPos, caretPos);
      }
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (items.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % items.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + items.length) % items.length);
        break;
      case "Enter":
      case "Tab":
        event.preventDefault();
        selectMember(items[Math.min(activeIndex, items.length - 1)]);
        break;
    }
  }

  function handleBlur() {
    // Option mousedown is prevented, so a real blur means focus genuinely left.
    setOpen(false);
  }

  const optionId = (index: number) => `${listboxId}-option-${index}`;

  return {
    open,
    items,
    activeIndex,
    setActiveIndex,
    setFloating: refs.setFloating,
    floatingStyles,
    listboxId,
    optionId,
    selectMember,
    /** Spread onto the <textarea>. */
    comboboxProps: {
      role: "combobox" as const,
      "aria-autocomplete": "list" as const,
      "aria-haspopup": "listbox" as const,
      "aria-expanded": open,
      "aria-controls": open ? listboxId : undefined,
      "aria-activedescendant":
        open && items.length > 0 ? optionId(activeIndex) : undefined,
      onChange: handleChange,
      onKeyDown: handleKeyDown,
      onBlur: handleBlur,
    },
  };
}
