/**
 * US-083 W7 — global quick capture pure logic.
 *
 * Shared by the client dialog (`components/quick-capture/quick-capture.tsx`)
 * and the options read model (`lib/quick-capture-options.ts`). No imports,
 * no DOM globals at runtime — everything is injectable so the node test
 * suite can exercise it directly.
 *
 * Locked decisions (see the W7 section of the US-083 execplan):
 * - Default destination: current `/boards/{boardId}` route if the board is
 *   creatable → last successful destination from localStorage (per-field
 *   validity: a still-creatable saved board is KEPT even when its saved list
 *   was archived — the board is never silently jumped away from; the list
 *   falls back to the left-most live list) → first creatable board in the
 *   deterministic membership/board order the options action returns.
 * - A board with no lists stays selected with a null list (honest disabled
 *   submit) — never a silent jump to another board.
 * - Shortcut: bare `C` (no ctrl/meta/alt/shift — Shift+C arrives as "C" and
 *   never fires) and `Cmd/Ctrl+K` (no alt/shift). Never while typing in an
 *   input/textarea/select/contenteditable, never on modified C (copy), never
 *   while another dialog/menu/listbox is open, never on key repeat or IME
 *   composition, never while the dialog itself is open. The caller calls
 *   `preventDefault` ONLY when the predicate returns a shortcut (i.e. the
 *   event is actually handled).
 * - localStorage contract: `planora.quickCapture.lastDestination` =
 *   `{ v: 1, boardId, listId }`.
 */

export type QuickCaptureList = { id: string; title: string };

export type QuickCaptureBoard = {
  id: string;
  title: string;
  lists: QuickCaptureList[];
};

export type QuickCaptureWorkspace = {
  id: string;
  name: string;
  boards: QuickCaptureBoard[];
};

/** The options action's serializable result — membership-derived scope. */
export type QuickCaptureOptions = {
  workspaces: QuickCaptureWorkspace[];
};

export type QuickCaptureDestination = {
  boardId: string;
  listId: string | null;
};

export type SavedQuickCaptureDestination = {
  v: 1;
  boardId: string;
  listId: string | null;
};

export const QUICK_CAPTURE_STORAGE_KEY = "planora.quickCapture.lastDestination";

const BOARD_ROUTE_PATTERN = /^\/boards\/([0-9a-fA-F-]{36})(?:[/?#]|$)/;

/** The board id of the current `/boards/{boardId}` route, if any. */
export function extractBoardIdFromPath(pathname: string): string | null {
  const match = BOARD_ROUTE_PATTERN.exec(pathname);
  return match ? match[1] : null;
}

/** Version- and shape-validated localStorage destination; invalid → null. */
export function parseLastDestination(raw: string | null): SavedQuickCaptureDestination | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1) {
      return null;
    }
    if (typeof record.boardId !== "string" || record.boardId.length === 0) {
      return null;
    }
    if (record.listId !== null && (typeof record.listId !== "string" || record.listId.length === 0)) {
      return null;
    }
    return { v: 1, boardId: record.boardId, listId: record.listId as string | null };
  } catch {
    return null;
  }
}

export function serializeDestination(boardId: string, listId: string | null): string {
  return JSON.stringify({ v: 1, boardId, listId });
}

export function findBoard(options: QuickCaptureOptions, boardId: string): QuickCaptureBoard | null {
  for (const workspace of options.workspaces) {
    const board = workspace.boards.find((candidate) => candidate.id === boardId);
    if (board) {
      return board;
    }
  }
  return null;
}

/**
 * The default list for a chosen board: the saved valid list when it belongs
 * to THIS board, otherwise the left-most live list (or null when the board
 * has no lists — the board stays selected, submit is honestly disabled).
 */
export function resolveListForBoard(
  board: QuickCaptureBoard,
  saved: SavedQuickCaptureDestination | null,
): string | null {
  if (saved && saved.boardId === board.id) {
    const savedList = board.lists.find((list) => list.id === saved.listId);
    if (savedList) {
      return savedList.id;
    }
  }
  return board.lists[0]?.id ?? null;
}

/**
 * Resolve the initial capture destination:
 * 1. current `/boards/{boardId}` route if the board is creatable;
 * 2. the saved destination when its board is still creatable (per-field
 *    validity — a stale saved list falls back to the left-most live list);
 * 3. the first creatable board in the options' deterministic order.
 * Returns null only when there is no creatable board at all.
 */
export function resolveDefaultDestination(
  options: QuickCaptureOptions,
  pathname: string,
  saved: SavedQuickCaptureDestination | null,
): QuickCaptureDestination | null {
  if (options.workspaces.length === 0) {
    return null;
  }

  const routeBoardId = extractBoardIdFromPath(pathname);
  if (routeBoardId) {
    const routeBoard = findBoard(options, routeBoardId);
    if (routeBoard) {
      return { boardId: routeBoard.id, listId: resolveListForBoard(routeBoard, saved) };
    }
  }

  if (saved) {
    const savedBoard = findBoard(options, saved.boardId);
    if (savedBoard) {
      return { boardId: savedBoard.id, listId: resolveListForBoard(savedBoard, saved) };
    }
  }

  const firstBoard = options.workspaces[0]?.boards[0];
  if (!firstBoard) {
    return null;
  }
  return { boardId: firstBoard.id, listId: resolveListForBoard(firstBoard, saved) };
}

/** Elements that receive text — the shortcut must never fire from these. */
const TYPING_TARGET_SELECTOR =
  "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/**
 * Open overlay detection: any radix dialog/menu/listbox content whose
 * `data-state="open"` marks it as currently open. The quick capture dialog
 * itself is covered by the `isOpen` context flag; every OTHER open dialog,
 * menu, or select listbox suppresses the global shortcut.
 */
export function findOpenOverlay(doc: Pick<Document, "querySelector">): Element | null {
  return doc.querySelector(
    '[data-state="open"][role="dialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]',
  );
}

export type QuickCaptureKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  // unknown: the predicate duck-types the target (node-safe) — real
  // KeyboardEvent targets and test fakes both fit.
  target: unknown;
};

export type QuickCaptureShortcut = "c" | "mod-k";

/**
 * The global shortcut predicate. Returns the matched shortcut ONLY when the
 * event is actually handled (the caller may then call preventDefault);
 * returns null on every guard — typing targets, copy (modified C), Shift+C,
 * key repeat, IME composition, the already-open dialog, and any other open
 * dialog/menu/listbox in the document.
 */
export function matchQuickCaptureShortcut(
  event: QuickCaptureKeyEvent,
  context: { isOpen: boolean; hasOpenOverlay?: () => boolean },
): QuickCaptureShortcut | null {
  if (context.isOpen) {
    return null;
  }
  if (event.repeat || event.isComposing) {
    return null;
  }
  if (isTypingTarget(event.target)) {
    return null;
  }
  if (context.hasOpenOverlay && context.hasOpenOverlay()) {
    return null;
  }

  // Bare C: no ctrl/meta/alt/shift. Shift+C arrives as key "C" and never
  // matches — copy (Ctrl/Cmd+C) is excluded by the modifiers.
  const unmodified = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  if (event.key === "c" && unmodified) {
    return "c";
  }
  // Cmd/Ctrl+K: no alt, no shift (Shift+Cmd/Ctrl+K arrives as "K").
  if (
    event.key === "k" &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  ) {
    return "mod-k";
  }
  return null;
}

/** Duck-typed element check — no DOM globals at runtime (node-safe). */
function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const element = target as { closest?: (selector: string) => unknown };
  if (typeof element.closest !== "function") {
    return false;
  }
  return element.closest(TYPING_TARGET_SELECTOR) !== null;
}
