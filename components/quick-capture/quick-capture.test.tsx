/**
 * US-083 W7 — Quick Capture dialog RTL suite.
 *
 * Proves the client contract:
 * - global chrome button opens the dialog IMMEDIATELY (no await in the open
 *   path — the dialog renders before the lazy options fetch resolves);
 * - options are loaded lazily on the FIRST open only, through the one new
 *   read-only Server Action, and defaults re-resolve on every open; closing
 *   mid-flight invalidates the in-flight fetch so the NEXT open refetches —
 *   a late resolve/reject of a stale request never overwrites the newer one
 *   (request-id discrimination);
 * - default destination: current /boards/{boardId} route if creatable →
 *   last saved destination from localStorage (per-field validity) → first
 *   creatable board in deterministic order; list = saved valid list for that
 *   board or left-most live list; a board with no lists stays selected with
 *   an honest disabled submit (never silently jumps);
 * - switching boards resets the list to the new board's left-most list;
 * - title is required (trimmed); description / due date / priority are
 *   optional and ride the SAME createCardAction FormData;
 * - success: dialog closes, destination is saved, and a self-contained
 *   accessible status toast offers the /boards/{boardId}?cardId={cardId}
 *   deep link; errors surface as an inline alert and keep the dialog open;
 * - no creatable workspaces → accessible empty state with disabled submit;
 * - 375px-safe layout classes (full-width fields, capped dialog width) and
 *   accessible form labels.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { QuickCaptureOptions } from "@/lib/quick-capture";

const BOARD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOARD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BOARD_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LIST_A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const LIST_A2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const LIST_B1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

const h = vi.hoisted(() => ({
  pathname: "/today",
  optionsAction: vi.fn(),
  createCard: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));
vi.mock("@/app/(authenticated)/actions", () => ({
  getQuickCaptureOptionsAction: h.optionsAction,
}));
vi.mock("@/app/(authenticated)/(dashboard)/boards/[boardId]/actions", () => ({
  createCardAction: h.createCard,
}));

import { QuickCapture } from "./quick-capture";

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
          lists: [{ id: LIST_B1, title: "Backlog" }],
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const user = userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  h.pathname = "/today";
  h.optionsAction.mockResolvedValue(options);
  h.createCard.mockResolvedValue({ success: true, cardId: "card-1" });
  window.localStorage.clear();
});

function openButton() {
  return screen.getByRole("button", { name: "Quick capture" });
}

function boardSelect() {
  return screen.getByRole("combobox", { name: "Board" });
}

function listSelect() {
  return screen.getByRole("combobox", { name: "List" });
}

/** Opens the dialog and waits for the lazy options to land. */
async function openWithOptions() {
  await user.click(openButton());
  await waitFor(() => expect(screen.queryByText("Loading boards…")).not.toBeInTheDocument());
}

async function pickBoardOption(name: string) {
  await user.click(boardSelect());
  await user.click(await screen.findByRole("option", { name }));
}

describe("QuickCapture — chrome button + immediate dialog", () => {
  it("renders the global chrome button with shortcut metadata", () => {
    render(<QuickCapture />);
    expect(openButton()).toBeInTheDocument();
    expect(openButton()).toHaveAttribute("aria-keyshortcuts", "c Control+K");
  });

  it("opens IMMEDIATELY on click — the dialog renders before lazy options resolve", async () => {
    const pending = deferred<QuickCaptureOptions>();
    h.optionsAction.mockReturnValue(pending.promise);

    render(<QuickCapture />);
    await user.click(openButton());

    // No await in the open path: the dialog (and its loading state) is
    // visible while the options fetch is still in flight.
    expect(screen.getByRole("dialog", { name: "Quick capture" })).toBeInTheDocument();
    expect(screen.getByText("Loading boards…")).toBeInTheDocument();
    expect(h.optionsAction).toHaveBeenCalledTimes(1);

    pending.resolve(options);
    await waitFor(() =>
      expect(screen.queryByText("Loading boards…")).not.toBeInTheDocument(),
    );
  });

  it("loads options lazily on the FIRST open only; repeated opens reuse the cache", async () => {
    render(<QuickCapture />);
    expect(h.optionsAction).not.toHaveBeenCalled();

    await openWithOptions();
    expect(h.optionsAction).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await openWithOptions();
    expect(h.optionsAction).toHaveBeenCalledTimes(1);
  });

  it("closing while the fetch is in flight lets the NEXT open refetch; a late resolve of the stale request never overwrites the new one", async () => {
    const first = deferred<QuickCaptureOptions>();
    h.optionsAction.mockReturnValueOnce(first.promise);
    render(<QuickCapture />);

    await user.click(openButton());
    expect(screen.getByText("Loading boards…")).toBeInTheDocument();
    expect(h.optionsAction).toHaveBeenCalledTimes(1);

    // Close mid-flight — the pending result must be discarded.
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const second = deferred<QuickCaptureOptions>();
    h.optionsAction.mockReturnValueOnce(second.promise);
    await user.click(openButton());
    expect(h.optionsAction).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Loading boards…")).toBeInTheDocument();

    // Late resolution of the STALE first request: dropped — it must not
    // populate options, and must not clobber the pending second request.
    await act(async () => {
      first.resolve({ workspaces: [] });
    });
    expect(screen.getByText("Loading boards…")).toBeInTheDocument();
    expect(boardSelect()).toHaveTextContent("Select a board");

    // The NEW request still lands normally.
    await act(async () => {
      second.resolve(options);
    });
    await waitFor(() =>
      expect(screen.queryByText("Loading boards…")).not.toBeInTheDocument(),
    );
    expect(boardSelect()).toHaveTextContent("Product Roadmap");
    expect(listSelect()).toHaveTextContent("To Do");
    // Close cleanly: no open dialog + unconsumed deferred left behind for
    // later tests (matters only when this test runs RED — mock hygiene).
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Quick capture" })).not.toBeInTheDocument(),
    );
    h.optionsAction.mockReset();
  });

  it("a late REJECTION of the stale request never surfaces the error state of the new one", async () => {
    const first = deferred<QuickCaptureOptions>();
    h.optionsAction.mockReturnValueOnce(first.promise);
    render(<QuickCapture />);

    await user.click(openButton());
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const second = deferred<QuickCaptureOptions>();
    h.optionsAction.mockReturnValueOnce(second.promise);
    await user.click(openButton());

    // Late rejection of the stale request: no error alert, still loading.
    await act(async () => {
      first.reject(new Error("late network failure"));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Loading boards…")).toBeInTheDocument();

    await act(async () => {
      second.resolve(options);
    });
    await waitFor(() =>
      expect(screen.queryByText("Loading boards…")).not.toBeInTheDocument(),
    );
    expect(boardSelect()).toHaveTextContent("Product Roadmap");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Quick capture" })).not.toBeInTheDocument(),
    );
    h.optionsAction.mockReset();
  });
});

describe("QuickCapture — default destination (US-078 AC2/AC3)", () => {
  it("defaults to the current /boards/{boardId} route board when creatable (left-most list)", async () => {
    h.pathname = `/boards/${BOARD_A}`;
    render(<QuickCapture />);
    await openWithOptions();

    expect(boardSelect()).toHaveTextContent("Product Roadmap");
    expect(listSelect()).toHaveTextContent("To Do");
  });

  it("uses the saved valid list when it belongs to the route board", async () => {
    h.pathname = `/boards/${BOARD_A}`;
    window.localStorage.setItem(
      "planora.quickCapture.lastDestination",
      JSON.stringify({ v: 1, boardId: BOARD_A, listId: LIST_A2 }),
    );
    render(<QuickCapture />);
    await openWithOptions();

    expect(boardSelect()).toHaveTextContent("Product Roadmap");
    expect(listSelect()).toHaveTextContent("Done");
  });

  it("falls back to the last saved destination when the route is not a board", async () => {
    window.localStorage.setItem(
      "planora.quickCapture.lastDestination",
      JSON.stringify({ v: 1, boardId: BOARD_B, listId: LIST_B1 }),
    );
    render(<QuickCapture />);
    await openWithOptions();

    expect(boardSelect()).toHaveTextContent("Sprint");
    expect(listSelect()).toHaveTextContent("Backlog");
  });

  it("keeps a still-creatable saved board when its saved list was archived (left-most fallback)", async () => {
    window.localStorage.setItem(
      "planora.quickCapture.lastDestination",
      JSON.stringify({ v: 1, boardId: BOARD_B, listId: "stale-list" }),
    );
    render(<QuickCapture />);
    await openWithOptions();

    expect(boardSelect()).toHaveTextContent("Sprint");
    expect(listSelect()).toHaveTextContent("Backlog");
  });

  it("falls back to the first creatable board in deterministic order", async () => {
    render(<QuickCapture />);
    await openWithOptions();

    expect(boardSelect()).toHaveTextContent("Product Roadmap");
    expect(listSelect()).toHaveTextContent("To Do");
  });

  it("a board with no lists stays selected with an honest disabled submit — never jumps", async () => {
    h.pathname = `/boards/${BOARD_C}`;
    render(<QuickCapture />);
    await openWithOptions();

    expect(boardSelect()).toHaveTextContent("R&D");
    expect(listSelect()).toBeDisabled();
    expect(listSelect()).toHaveTextContent("No lists on this board");
    expect(screen.getByRole("button", { name: "Create card" })).toBeDisabled();
  });

  it("switching boards resets the list to the new board's left-most list", async () => {
    render(<QuickCapture />);
    await openWithOptions();
    expect(listSelect()).toHaveTextContent("To Do");

    await pickBoardOption("Sprint");

    expect(boardSelect()).toHaveTextContent("Sprint");
    expect(listSelect()).toHaveTextContent("Backlog");
  });

  it("groups boards under their workspace (workspace implied in the board selector)", async () => {
    render(<QuickCapture />);
    await openWithOptions();

    await user.click(boardSelect());
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Product Roadmap" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sprint" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "R&D" })).toBeInTheDocument();
  });

  it("no creatable workspaces → accessible empty state with disabled submit", async () => {
    h.optionsAction.mockResolvedValue({ workspaces: [] });
    render(<QuickCapture />);
    await openWithOptions();

    expect(
      screen.getByText("No boards you can create cards on yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create card" })).toBeDisabled();
  });
});

describe("QuickCapture — required title, optional fields, submit mapping", () => {
  it("requires a trimmed title: submit stays disabled for empty/whitespace", async () => {
    render(<QuickCapture />);
    await openWithOptions();

    const title = screen.getByRole("textbox", { name: "Title" });
    const submit = screen.getByRole("button", { name: "Create card" });
    expect(submit).toBeDisabled();

    await user.type(title, "   ");
    expect(submit).toBeDisabled();

    await user.clear(title);
    await user.type(title, "A real title");
    expect(submit).toBeEnabled();
  });

  it("submits trimmed title + optional fields in ONE createCardAction FormData", async () => {
    render(<QuickCapture />);
    await openWithOptions();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "  Captured task  ");
    await user.type(
      screen.getByRole("textbox", { name: "Description (optional)" }),
      "Some notes",
    );
    // happy-dom does not expose type=date as role textbox; drive it by label.
    fireEvent.change(screen.getByLabelText("Due date (optional)"), {
      target: { value: "2026-08-15" },
    });
    await user.click(screen.getByRole("combobox", { name: "Priority (optional)" }));
    await user.click(await screen.findByRole("option", { name: "🔴 Urgent" }));

    await user.click(screen.getByRole("button", { name: "Create card" }));

    await waitFor(() => expect(h.createCard).toHaveBeenCalledTimes(1));
    const formData = h.createCard.mock.calls[0][0] as FormData;
    expect(formData.get("listId")).toBe(LIST_A1);
    expect(formData.get("title")).toBe("Captured task");
    expect(formData.get("description")).toBe("Some notes");
    expect(formData.get("dueDate")).toBe("2026-08-15");
    expect(formData.get("priority")).toBe("URGENT");
  });

  it("omits empty optional fields from the payload", async () => {
    render(<QuickCapture />);
    await openWithOptions();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Bare card");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    await waitFor(() => expect(h.createCard).toHaveBeenCalledTimes(1));
    const formData = h.createCard.mock.calls[0][0] as FormData;
    expect(formData.get("listId")).toBe(LIST_A1);
    expect(formData.get("title")).toBe("Bare card");
    expect(formData.get("description")).toBeNull();
    expect(formData.get("dueDate")).toBeNull();
    expect(formData.get("priority")).toBeNull();
  });
});

describe("QuickCapture — success toast, errors, persistence", () => {
  it("success: closes the dialog, saves the destination, and shows the deep-link status toast", async () => {
    h.createCard.mockResolvedValue({ success: true, cardId: "card-42" });
    render(<QuickCapture />);
    await openWithOptions();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Done deal");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    // Self-contained transient status: no app-wide toast framework.
    const status = await screen.findByRole("status");
    expect(within(status).getByText("Card created")).toBeInTheDocument();
    const link = within(status).getByRole("link", { name: "View Card on Board" });
    expect(link).toHaveAttribute("href", `/boards/${BOARD_A}?cardId=card-42`);
    // The dialog itself closed.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Quick capture" })).not.toBeInTheDocument(),
    );
    // Last destination persisted for the next default.
    expect(window.localStorage.getItem("planora.quickCapture.lastDestination")).toBe(
      JSON.stringify({ v: 1, boardId: BOARD_A, listId: LIST_A1 }),
    );
  });

  it("error: inline alert keeps the dialog open with an honest message", async () => {
    h.createCard.mockResolvedValue({ success: false, error: "List not found" });
    render(<QuickCapture />);
    await openWithOptions();

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Doomed");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("List not found");
    expect(screen.getByRole("dialog", { name: "Quick capture" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("options fetch failure surfaces an inline alert and never a broken submit", async () => {
    h.optionsAction.mockRejectedValue(new Error("network"));
    render(<QuickCapture />);
    await user.click(openButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your boards");
    expect(screen.getByRole("button", { name: "Create card" })).toBeDisabled();
  });

  it("retry refetches the options from the inline error state", async () => {
    h.optionsAction.mockRejectedValueOnce(new Error("network"));
    render(<QuickCapture />);
    await user.click(openButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your boards");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(boardSelect()).toBeEnabled();
    expect(h.optionsAction).toHaveBeenCalledTimes(2);
  });
});

describe("QuickCapture — 375px-safe classes + accessibility", () => {
  it("dialog content is full-width capped (max-w-md) and fields are full-width", async () => {
    render(<QuickCapture />);
    await openWithOptions();

    const dialog = screen.getByRole("dialog", { name: "Quick capture" });
    expect(dialog.className).toContain("max-w-md");
    expect(dialog.className).toContain("w-full");
    expect(boardSelect().className).toContain("w-full");
    expect(listSelect().className).toContain("w-full");
    expect(screen.getByRole("textbox", { name: "Title" }).className).toContain("w-full");
    expect(screen.getByLabelText("Due date (optional)").className).toContain("w-full");
  });

  it("labels its fields accessibly (Title / Description / Board / List / Due date / Priority)", async () => {
    render(<QuickCapture />);
    await openWithOptions();

    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Description (optional)" })).toBeInTheDocument();
    expect(boardSelect()).toBeInTheDocument();
    expect(listSelect()).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Priority (optional)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Due date (optional)")).toBeInTheDocument();
    // Required marker on the title label.
    expect(screen.getByText(/Required/)).toBeInTheDocument();
  });
});
