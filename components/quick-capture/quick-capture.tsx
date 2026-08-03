"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AddSquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  QUICK_CAPTURE_STORAGE_KEY,
  findBoard,
  findOpenOverlay,
  matchQuickCaptureShortcut,
  parseLastDestination,
  resolveDefaultDestination,
  serializeDestination,
  type QuickCaptureOptions,
} from "@/lib/quick-capture";

import { createCardAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { getQuickCaptureOptionsAction } from "@/app/(authenticated)/actions";

const TOAST_DISMISS_MS = 6000;

/**
 * US-083 W7 — Global Quick Capture.
 *
 * Self-contained: the chrome button, the dialog (opens IMMEDIATELY — nothing
 * is awaited in the open path), the lazy options fetch (one read-only Server
 * Action, first open only), the board/list defaults, the submit through the
 * EXISTING `createCardAction` (optional description/due date/priority ride
 * the same FormData), and the success toast (a transient `role="status"`
 * owned by this component — no Notification row, no app-wide toast
 * framework). No auto-navigation; the toast's "View Card on Board" deep link
 * is the only path off the current route.
 *
 * Shortcuts: bare `C` and `Cmd/Ctrl+K` via the locked guard contract in
 * `lib/quick-capture.ts` — preventDefault ONLY when actually handled.
 * `Cmd/Ctrl+K` is a reserved browser shortcut (address bar / find); the
 * guard prevents it here, but portability across browsers is not claimed
 * (see DESIGN.md "Keyboard Shortcuts" and the W7 execplan section).
 */
export function QuickCapture() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<QuickCaptureOptions | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("NONE");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ boardId: string; cardId: string } | null>(null);
  const [shortcutsReady, setShortcutsReady] = useState(false);

  // Lazy options: fetched once on the FIRST open, then cached for the
  // session. The dialog itself never waits on it. A failed fetch can be
  // retried from the inline error state. Closing the dialog mid-fetch
  // clears the started flag AND invalidates the in-flight request
  // (fetchSeqRef bump), so the next open refetches — and a late
  // resolve/reject of the stale request can never overwrite the newer one
  // (request-id discrimination). Board/list selects stay CONTROLLED from
  // first mount (`?? ""` — never `undefined`) so they never flip
  // uncontrolled → controlled while options load.
  const fetchStartedRef = useRef(false);
  const fetchSeqRef = useRef(0);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!open) {
      // Mid-flight close: discard the pending result, allow a fresh fetch.
      fetchStartedRef.current = false;
      fetchSeqRef.current += 1;
    }
  }, [open]);

  useEffect(() => {
    if (!open || options || fetchStartedRef.current) {
      return;
    }
    fetchStartedRef.current = true;
    const requestId = fetchSeqRef.current;
    getQuickCaptureOptionsAction()
      .then((result) => {
        if (requestId === fetchSeqRef.current) {
          setOptions(result);
        }
      })
      .catch(() => {
        if (requestId === fetchSeqRef.current) {
          setOptionsError(true);
        }
      });
  }, [open, options, retryKey]);

  // Defaults re-resolve on EVERY open against fresh localStorage: current
  // /boards/{boardId} route (if creatable) → last saved destination (if its
  // board is still creatable) → first creatable board in deterministic order.
  useEffect(() => {
    if (!open || !options) {
      return;
    }
    const saved = parseLastDestination(window.localStorage.getItem(QUICK_CAPTURE_STORAGE_KEY));
    const destination = resolveDefaultDestination(options, pathname, saved);
    setBoardId(destination?.boardId ?? null);
    setListId(destination?.listId ?? null);
  }, [open, options, pathname]);

  // Global shortcut listener. Re-subscribes on open-state change so the
  // predicate always sees the current dialog state.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const shortcut = matchQuickCaptureShortcut(event, {
        isOpen: open,
        hasOpenOverlay: () => findOpenOverlay(document) !== null,
      });
      if (!shortcut) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    setShortcutsReady(true);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Transient status: auto-dismiss, self-contained.
  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedBoard = boardId && options ? findBoard(options, boardId) : null;

  function handleBoardChange(nextBoardId: string) {
    setBoardId(nextBoardId);
    // Selector reset: the new board's left-most live list (or none — the
    // honest disabled submit covers a list-less board).
    const nextBoard = findBoard(options ?? { workspaces: [] }, nextBoardId);
    setListId(nextBoard?.lists[0]?.id ?? null);
    setError(null);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("NONE");
    setError(null);
    setBoardId(null);
    setListId(null);
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !boardId || !listId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("listId", listId);
      formData.set("title", trimmedTitle);
      if (description.trim()) {
        formData.set("description", description.trim());
      }
      if (dueDate) {
        formData.set("dueDate", dueDate);
      }
      if (priority !== "NONE") {
        formData.set("priority", priority);
      }

      const result = await createCardAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }

      // Remember the successful destination for the next default (only a
      // successful create persists — never a stale draft).
      window.localStorage.setItem(
        QUICK_CAPTURE_STORAGE_KEY,
        serializeDestination(boardId, listId),
      );
      setToast({ boardId, cardId: result.cardId });
      setOpen(false);
      resetForm();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    Boolean(options) &&
    !optionsError &&
    Boolean(title.trim()) &&
    Boolean(boardId) &&
    Boolean(listId) &&
    !submitting;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label="Quick capture"
        aria-keyshortcuts="c Control+K"
        data-shortcuts-ready={shortcutsReady ? "true" : "false"}
        title="Quick capture (C or Ctrl+K)"
        className="relative flex h-auto items-center gap-1.5 px-2 py-1.5 text-muted-foreground"
      >
        <HugeiconsIcon icon={AddSquareIcon} className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quick capture</DialogTitle>
            <DialogDescription>
              Create a card on any board you can edit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quick-capture-title">
                Title{" "}
                <span aria-hidden="true" className="text-destructive">*</span>{" "}
                <span aria-hidden="true" className="text-muted-foreground">(Required)</span>
              </Label>
              <Input
                id="quick-capture-title"
                className="w-full"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setError(null);
                }}
                placeholder="What needs to be done?"
                maxLength={160}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quick-capture-description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="quick-capture-description"
                className="w-full"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add more detail…"
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-capture-board">Board</Label>
                <Select
                  value={boardId ?? ""}
                  onValueChange={handleBoardChange}
                  disabled={!options || optionsError || submitting}
                >
                  <SelectTrigger id="quick-capture-board" className="w-full">
                    <SelectValue placeholder="Select a board" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.workspaces.map((workspace) => (
                      <SelectGroup key={workspace.id}>
                        <SelectLabel>{workspace.name}</SelectLabel>
                        {workspace.boards.map((board) => (
                          <SelectItem key={board.id} value={board.id}>
                            {board.title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-capture-list">List</Label>
                <Select
                  value={listId ?? ""}
                  onValueChange={setListId}
                  disabled={!boardId || !selectedBoard || selectedBoard.lists.length === 0 || submitting}
                >
                  <SelectTrigger id="quick-capture-list" className="w-full">
                    <SelectValue placeholder="No lists on this board" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedBoard?.lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quick-capture-due-date">
                  Due date <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="quick-capture-due-date"
                  type="date"
                  className="w-full"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quick-capture-priority">
                  Priority <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Select value={priority} onValueChange={setPriority} disabled={submitting}>
                  <SelectTrigger id="quick-capture-priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No priority</SelectItem>
                    <SelectItem value="URGENT">🔴 Urgent</SelectItem>
                    <SelectItem value="HIGH">🟠 High</SelectItem>
                    <SelectItem value="MEDIUM">🟡 Medium</SelectItem>
                    <SelectItem value="LOW">🔵 Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!options && !optionsError && (
              <p role="status" className="text-sm text-muted-foreground">
                Loading boards…
              </p>
            )}

            {optionsError ? (
              <p role="alert" className="text-sm text-destructive">
                Couldn&apos;t load your boards.{" "}
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => {
                    fetchStartedRef.current = false;
                    setOptionsError(false);
                    setRetryKey((key) => key + 1);
                  }}
                >
                  Retry
                </button>
              </p>
            ) : null}

            {options && options.workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No boards you can create cards on yet.
              </p>
            ) : null}

            {error ? (
              <p id="quick-capture-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? "Creating…" : "Create card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast ? (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg"
        >
          <span className="text-sm text-foreground">Card created</span>
          <Link
            href={`/boards/${toast.boardId}?cardId=${toast.cardId}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            View Card on Board
          </Link>
        </div>
      ) : null}
    </>
  );
}
