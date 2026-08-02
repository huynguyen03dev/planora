/**
 * US-083 W7 — quick capture pure logic.
 *
 * Covers the contract the dialog is built on, without DOM or React:
 * - default destination resolution: current /boards/{boardId} route (if
 *   creatable) → last saved destination from localStorage (per-field
 *   validity: a still-creatable saved board is kept even when its saved list
 *   was archived — the board is never silently jumped away from; the list
 *   falls back to the left-most live list) → first creatable board in
 *   deterministic membership/board order. A board with no lists stays
 *   selected with a null list (honest disabled submit), never a jump.
 * - the global shortcut predicate: bare `C` and `Cmd/Ctrl+K` only — guarded
 *   against typing targets, copy (modified C), other open dialogs/menus,
 *   key repeat, IME composition, and the already-open dialog; preventDefault
 *   is the caller's decision and must be taken ONLY when the predicate
 *   matches ("actually handled").
 * - the localStorage contract (versioned, shape-validated).
 */
import { describe, expect, it } from "vitest";

import {
  QUICK_CAPTURE_STORAGE_KEY,
  extractBoardIdFromPath,
  findOpenOverlay,
  matchQuickCaptureShortcut,
  parseLastDestination,
  resolveDefaultDestination,
  resolveListForBoard,
  serializeDestination,
  type QuickCaptureKeyEvent,
  type QuickCaptureOptions,
} from "./quick-capture";

const BOARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOARD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOARD_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LIST_A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const LIST_A2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const LIST_B1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const LIST_B2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

/** Two workspaces: Acme (Roadmap with 2 lists, Sprint with 2 lists) then
 *  Globex (R&D with NO lists) — the list-less board must stay selectable. */
const options: QuickCaptureOptions = {
  workspaces: [
    {
      id: "ws-acme",
      name: "Acme",
      boards: [
        {
          id: BOARD_A,
          title: "Product Roadmap",
          lists: [
            { id: LIST_A1, title: "To Do" },
            { id: LIST_A2, title: "Done" },
          ],
        },
        {
          id: BOARD_B,
          title: "Sprint",
          lists: [
            { id: LIST_B1, title: "Backlog" },
            { id: LIST_B2, title: "In Progress" },
          ],
        },
      ],
    },
    {
      id: "ws-globex",
      name: "Globex",
      boards: [{ id: BOARD_C, title: "R&D", lists: [] }],
    },
  ],
};

function keyEvent(overrides: Partial<QuickCaptureKeyEvent> = {}): QuickCaptureKeyEvent {
  return {
    key: "c",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    target: null,
    ...overrides,
  };
}

/** A fake element-like target whose `closest` only matches the given tag. */
function typingTarget(tag: string) {
  return { closest: (selector: string) => (selector.includes(tag) ? {} : null) };
}

describe("extractBoardIdFromPath", () => {
  it("matches the /boards/{boardId} route", () => {
    expect(extractBoardIdFromPath(`/boards/${BOARD_A}`)).toBe(BOARD_A);
  });

  it("matches with a trailing slash or query string (deep link)", () => {
    expect(extractBoardIdFromPath(`/boards/${BOARD_A}/`)).toBe(BOARD_A);
    expect(extractBoardIdFromPath(`/boards/${BOARD_A}?cardId=xyz`)).toBe(BOARD_A);
  });

  it("returns null for non-board routes and malformed ids", () => {
    expect(extractBoardIdFromPath("/today")).toBeNull();
    expect(extractBoardIdFromPath("/boards")).toBeNull();
    expect(extractBoardIdFromPath("/boards/not-a-uuid")).toBeNull();
    expect(extractBoardIdFromPath("/workspace/acme/boards")).toBeNull();
  });
});

describe("parseLastDestination / serializeDestination (localStorage contract)", () => {
  it("rejects null, empty, and non-JSON payloads", () => {
    expect(parseLastDestination(null)).toBeNull();
    expect(parseLastDestination("")).toBeNull();
    expect(parseLastDestination("not json")).toBeNull();
  });

  it("rejects unknown versions and malformed shapes", () => {
    expect(parseLastDestination(JSON.stringify({ v: 2, boardId: BOARD_A, listId: null }))).toBeNull();
    expect(parseLastDestination(JSON.stringify({ v: 1, listId: null }))).toBeNull();
    expect(parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_A }))).toBeNull();
    expect(parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_A, listId: 42 }))).toBeNull();
  });

  it("accepts the version-1 shape with a null or string list id", () => {
    expect(parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_A, listId: null }))).toEqual({
      v: 1,
      boardId: BOARD_A,
      listId: null,
    });
    expect(parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_A, listId: LIST_A1 }))).toEqual({
      v: 1,
      boardId: BOARD_A,
      listId: LIST_A1,
    });
  });

  it("serializes and round-trips", () => {
    const raw = serializeDestination(BOARD_B, LIST_B2);
    expect(parseLastDestination(raw)).toEqual({ v: 1, boardId: BOARD_B, listId: LIST_B2 });
    expect(raw).toContain('"v":1');
    expect(QUICK_CAPTURE_STORAGE_KEY).toMatch(/planora/);
  });
});

describe("resolveDefaultDestination", () => {
  it("US-078 AC2/AC3: prefers the current /boards/{boardId} route when creatable, list = left-most", () => {
    const destination = resolveDefaultDestination(
      options,
      `/boards/${BOARD_A}`,
      parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_B, listId: LIST_B1 })),
    );
    expect(destination).toEqual({ boardId: BOARD_A, listId: LIST_A1 });
  });

  it("uses the saved valid list when it belongs to the chosen (route) board", () => {
    const destination = resolveDefaultDestination(
      options,
      `/boards/${BOARD_A}`,
      parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_A, listId: LIST_A2 })),
    );
    expect(destination).toEqual({ boardId: BOARD_A, listId: LIST_A2 });
  });

  it("falls back to the saved destination when the route is not a creatable board", () => {
    const destination = resolveDefaultDestination(
      options,
      "/today",
      parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_B, listId: LIST_B2 })),
    );
    expect(destination).toEqual({ boardId: BOARD_B, listId: LIST_B2 });
  });

  it("keeps a still-creatable saved board when its saved list was archived (left-most fallback)", () => {
    const destination = resolveDefaultDestination(
      options,
      "/today",
      parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_B, listId: "stale-list" })),
    );
    expect(destination).toEqual({ boardId: BOARD_B, listId: LIST_B1 });
  });

  it("falls back to the first creatable board in deterministic order when nothing saved", () => {
    const destination = resolveDefaultDestination(options, "/today", null);
    expect(destination).toEqual({ boardId: BOARD_A, listId: LIST_A1 });
  });

  it("keeps a list-less board selected with a null list — never silently jumps", () => {
    const destination = resolveDefaultDestination(
      options,
      `/boards/${BOARD_C}`,
      parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_A, listId: LIST_A1 })),
    );
    expect(destination).toEqual({ boardId: BOARD_C, listId: null });
  });

  it("returns null when there are no creatable workspaces or boards", () => {
    expect(resolveDefaultDestination({ workspaces: [] }, "/today", null)).toBeNull();
    expect(
      resolveDefaultDestination({ workspaces: [{ id: "w", name: "W", boards: [] }] }, "/today", null),
    ).toBeNull();
  });
});

describe("resolveListForBoard", () => {
  const board = options.workspaces[0].boards[0];

  it("prefers the saved valid list for the same board", () => {
    expect(
      resolveListForBoard(board, parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_A, listId: LIST_A2 }))),
    ).toBe(LIST_A2);
  });

  it("falls back to the left-most live list when the saved list is stale", () => {
    expect(
      resolveListForBoard(board, parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_A, listId: "gone" }))),
    ).toBe(LIST_A1);
  });

  it("ignores a saved list belonging to a different board", () => {
    expect(
      resolveListForBoard(board, parseLastDestination(JSON.stringify({ v: 1, boardId: BOARD_B, listId: LIST_B1 }))),
    ).toBe(LIST_A1);
  });

  it("returns null for a board with no lists", () => {
    expect(resolveListForBoard(options.workspaces[1].boards[0], null)).toBeNull();
  });
});

describe("matchQuickCaptureShortcut", () => {
  it("matches bare C with no modifiers", () => {
    expect(matchQuickCaptureShortcut(keyEvent(), { isOpen: false })).toBe("c");
  });

  it("matches Ctrl+K and Cmd+K (but never K alone)", () => {
    expect(matchQuickCaptureShortcut(keyEvent({ key: "k", ctrlKey: true }), { isOpen: false })).toBe("mod-k");
    expect(matchQuickCaptureShortcut(keyEvent({ key: "k", metaKey: true }), { isOpen: false })).toBe("mod-k");
    expect(matchQuickCaptureShortcut(keyEvent({ key: "k" }), { isOpen: false })).toBeNull();
  });

  it("never matches modified C (copy: Ctrl/Cmd+C, or any alt/shift C)", () => {
    expect(matchQuickCaptureShortcut(keyEvent({ ctrlKey: true }), { isOpen: false })).toBeNull();
    expect(matchQuickCaptureShortcut(keyEvent({ metaKey: true }), { isOpen: false })).toBeNull();
    expect(matchQuickCaptureShortcut(keyEvent({ altKey: true }), { isOpen: false })).toBeNull();
    // Shift+C arrives as key "C" — not a bare lowercase c.
    expect(matchQuickCaptureShortcut(keyEvent({ key: "C" }), { isOpen: false })).toBeNull();
  });

  it("never matches Ctrl+Shift+K (key 'K')", () => {
    expect(
      matchQuickCaptureShortcut(keyEvent({ key: "K", ctrlKey: true, shiftKey: true }), { isOpen: false }),
    ).toBeNull();
  });

  it("ignores key repeat and IME composition", () => {
    expect(matchQuickCaptureShortcut(keyEvent({ repeat: true }), { isOpen: false })).toBeNull();
    expect(matchQuickCaptureShortcut(keyEvent({ isComposing: true }), { isOpen: false })).toBeNull();
  });

  it("never fires while the quick capture dialog is already open", () => {
    expect(matchQuickCaptureShortcut(keyEvent(), { isOpen: true })).toBeNull();
  });

  it("never fires while another dialog/menu/listbox is open", () => {
    expect(
      matchQuickCaptureShortcut(keyEvent(), { isOpen: false, hasOpenOverlay: () => true }),
    ).toBeNull();
  });

  it("fires when no overlay is open", () => {
    expect(
      matchQuickCaptureShortcut(keyEvent(), { isOpen: false, hasOpenOverlay: () => false }),
    ).toBe("c");
  });

  it.each(["input", "textarea", "select"])("never fires from a focused %s", (tag) => {
    const target = typingTarget(tag);
    expect(matchQuickCaptureShortcut(keyEvent({ target }), { isOpen: false })).toBeNull();
  });

  it("never fires from a contenteditable element", () => {
    const target = typingTarget("contenteditable");
    expect(matchQuickCaptureShortcut(keyEvent({ target }), { isOpen: false })).toBeNull();
  });

  it("fires for non-element targets (window/document body)", () => {
    expect(matchQuickCaptureShortcut(keyEvent({ target: null }), { isOpen: false })).toBe("c");
    expect(
      matchQuickCaptureShortcut(keyEvent({ target: { closest: undefined } }), { isOpen: false }),
    ).toBe("c");
  });
});

describe("findOpenOverlay", () => {
  it("finds an open radix dialog/menu/listbox content by data-state", () => {
    const doc = {
      querySelector: (selector: string) => (selector.includes('[role="dialog"]') ? {} : null),
    };
    expect(findOpenOverlay(doc)).toBeTruthy();
  });

  it("returns null when nothing is open", () => {
    const doc = { querySelector: () => null };
    expect(findOpenOverlay(doc)).toBeNull();
  });
});
