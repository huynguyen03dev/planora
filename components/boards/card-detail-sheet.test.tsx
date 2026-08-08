import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CardDetailRecord } from "@/lib/card";
import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

// Server Actions + router are boundaries; stub them so the test drives only the
// sheet's own autosave logic.
// Captures the props CardLabelsSection last received, so the A1 test can assert
// the sheet forwards the STORE's live label set (not the stale server prop).
const labelSectionSpy = vi.hoisted(() => ({
  latest: null as null | { cardLabelIds: string[]; boardLabels: { id: string; name: string; color: string }[] },
}));

const actions = vi.hoisted(() => ({
  updateCardDetailsAction: vi.fn(),
  updateCardEstimateAction: vi.fn(),
  updateCardDueDateAction: vi.fn(),
  updateCardPriorityAction: vi.fn(),
  updateCardCoverAction: vi.fn(),
  setCardCoverAction: vi.fn(),
  assignCardMemberAction: vi.fn(),
  removeCardMemberAction: vi.fn(),
  createCommentAction: vi.fn(),
  loadMoreCardDetailAction: vi.fn(),
  archiveCardAction: vi.fn(),
}));

// Shared, controllable doubles: the close/reopen lifecycle tests drive the URL
// (as router.replace/push would) and assert against router.replace. The default
// `?cardId=card-1` keeps every existing test rendering an OPEN sheet.
const routerMock = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
const urlParams = vi.hoisted(() => new URLSearchParams("cardId=card-1"));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/boards/board-1",
  useSearchParams: () => urlParams,
}));

vi.mock("@/app/(authenticated)/(dashboard)/boards/[boardId]/actions", () => actions);

// The heavy child editors have their own coverage; here they're rendered as
// inert stubs so mounting the sheet doesn't drag in their action imports.
vi.mock("@/components/boards/card-attachments", () => ({ CardAttachments: () => null }));
vi.mock("@/components/boards/card-completion-toggle", () => ({
  CardCompletionToggle: () => null,
}));
vi.mock("@/components/boards/card-checklists-section", () => ({
  CardChecklistsSection: () => null,
}));
vi.mock("@/components/boards/card-labels-section", () => ({
  CardLabelsSection: (props: { cardLabelIds: string[]; boardLabels: { id: string; name: string; color: string }[] }) => {
    labelSectionSpy.latest = props;
    return null;
  },
}));
vi.mock("./use-mention-autocomplete", () => ({
  useMentionAutocomplete: ({
    setValue,
  }: {
    setValue: (value: string) => void;
  }) => ({
    open: false,
    items: [],
    activeIndex: 0,
    setActiveIndex: vi.fn(),
    setFloating: vi.fn(),
    floatingStyles: {},
    listboxId: "mentions",
    optionId: (i: number) => `mention-${i}`,
    selectMember: vi.fn(),
    // Emulate the real hook's combobox contract: onChange pushes the typed
    // value through the setValue callback the component passes in, so the
    // controlled textarea state stays in sync during tests.
    comboboxProps: {
      onChange: (event: { target: { value: string } }) =>
        setValue(event.target.value),
    },
  }),
}));

import { CardDetailSheet } from "./card-detail-sheet";

function makeCard(overrides: Partial<CardDetailRecord> = {}): CardDetailRecord {
  return {
    id: "card-1",
    listId: "list-1",
    title: "Original title",
    description: null,
    estimateHours: null,
    dueDate: null,
    completedAt: null,
    priority: null,
    coverImage: null,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function renderSheet(props: Partial<Parameters<typeof CardDetailSheet>[0]> = {}) {
  return render(
    <CardDetailSheet
      open
      card={makeCard()}
      comments={[]}
      commentsHasMore={false}
      activity={[]}
      activityHasMore={false}
      attachments={[]}
      assignees={[]}
      assignableMembers={[]}
      boardId="board-1"
      boardLabels={[]}
      cardLabelIds={[]}
      checklists={[]}
      canEdit
      canArchive={false}
      canComment
      {...props}
    />,
  );
}

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("CardDetailSheet — title autosave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
  });

  it("renders nothing when there is no card", () => {
    const { container } = renderSheet({ card: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the title in an editable field when the viewer can edit", () => {
    renderSheet();
    expect(screen.getByLabelText("Card title")).toHaveValue("Original title");
  });

  it("autosaves the title on blur when it changed", async () => {
    actions.updateCardDetailsAction.mockResolvedValue({ success: true });
    renderSheet();

    const title = screen.getByLabelText("Card title");
    await user.clear(title);
    await user.type(title, "Renamed card");
    await user.tab(); // blur

    await waitFor(() => expect(actions.updateCardDetailsAction).toHaveBeenCalledTimes(1));
    const formData = actions.updateCardDetailsAction.mock.calls[0][0] as FormData;
    expect(formData.get("cardId")).toBe("card-1");
    expect(formData.get("title")).toBe("Renamed card");
  });

  it("does not save when the title is unchanged", async () => {
    renderSheet();
    const title = screen.getByLabelText("Card title");
    await user.click(title);
    await user.tab();
    expect(actions.updateCardDetailsAction).not.toHaveBeenCalled();
  });

  it("rejects an empty title, reverts, and does not call the action", async () => {
    renderSheet();
    const title = screen.getByLabelText("Card title");
    await user.clear(title);
    await user.tab();

    expect(actions.updateCardDetailsAction).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Card title")).toHaveValue("Original title"));
    expect(screen.getByText(/Title cannot be empty/)).toBeInTheDocument();
  });

  it("queues a description blur made while the title save is in flight (U2)", async () => {
    let resolveFirst: ((value: { success: boolean }) => void) | null = null;
    actions.updateCardDetailsAction
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue({ success: true });

    renderSheet();

    const title = screen.getByLabelText("Card title");
    await user.clear(title);
    await user.type(title, "Renamed card");
    await user.tab(); // blur title → save 1 starts and stays pending

    await waitFor(() =>
      expect(actions.updateCardDetailsAction).toHaveBeenCalledTimes(1),
    );

    // Description blur lands while save 1 is still in flight.
    const description = screen.getByPlaceholderText(
      "Add a more detailed description...",
    );
    await user.type(description, "More details");
    await user.tab(); // blur description → save 2 queued, not dropped

    // Still only the in-flight save while the queue waits for it.
    expect(actions.updateCardDetailsAction).toHaveBeenCalledTimes(1);

    resolveFirst!({ success: true });

    await waitFor(() =>
      expect(actions.updateCardDetailsAction).toHaveBeenCalledTimes(2),
    );
    const formData = actions.updateCardDetailsAction.mock
      .calls[1][0] as FormData;
    expect(formData.get("title")).toBe("Renamed card");
    expect(formData.get("description")).toBe("More details");
  });

  it("keeps other fields editable while a field's save is in flight (U2)", async () => {
    let resolveFirst: ((value: { success: boolean }) => void) | null = null;
    actions.updateCardDetailsAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    renderSheet();

    const title = screen.getByLabelText("Card title");
    await user.clear(title);
    await user.type(title, "Renamed card");
    await user.tab();

    await waitFor(() =>
      expect(actions.updateCardDetailsAction).toHaveBeenCalledTimes(1),
    );

    // The shared isPending freeze is gone: while the title save is pending,
    // the description editor and the estimate picker stay enabled.
    const description = screen.getByPlaceholderText(
      "Add a more detailed description...",
    );
    expect(description).not.toBeDisabled();
    expect(title).not.toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Estimate" }),
    ).not.toBeDisabled();

    resolveFirst!({ success: true });
  });

  it("shows a transient 'Saved' confirmation after a successful save (U3)", async () => {
    actions.updateCardDetailsAction.mockResolvedValue({ success: true });
    renderSheet();

    const title = screen.getByLabelText("Card title");
    await user.clear(title);
    await user.type(title, "Renamed card");
    await user.tab();

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    // Confirmation is transient: it disappears after ~1.5s.
    await waitFor(
      () => expect(screen.queryByText("Saved")).not.toBeInTheDocument(),
      { timeout: 2500 },
    );
  });

  it("surfaces a failed autosave as full error text (U3)", async () => {
    actions.updateCardDetailsAction.mockResolvedValue({
      success: false,
      error: "Failed to update card. Please try again.",
    });
    renderSheet();

    const title = screen.getByLabelText("Card title");
    await user.clear(title);
    await user.type(title, "Renamed card");
    await user.tab();

    await waitFor(() =>
      expect(
        screen.getByText("Failed to update card. Please try again."),
      ).toBeInTheDocument(),
    );
  });

  it("renders the title as static text when the viewer cannot edit", () => {
    renderSheet({ canEdit: false });
    expect(screen.queryByLabelText("Card title")).not.toBeInTheDocument();
    // The title renders as a static heading (the dialog also titles itself with
    // the card name for a11y, so there may be more than one match).
    expect(screen.getAllByRole("heading", { name: "Original title" }).length).toBeGreaterThan(0);
  });
});

describe("CardDetailSheet — archive from detail (US-069)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
  });

  it("does not show the archive button when canArchive is false", () => {
    renderSheet();
    expect(
      screen.queryByRole("button", { name: "Archive card" }),
    ).not.toBeInTheDocument();
  });

  it("archive button opens the confirm dialog; confirm calls archiveCardAction", async () => {
    actions.archiveCardAction.mockResolvedValue({ success: true });
    renderSheet({ canArchive: true });

    await user.click(screen.getByRole("button", { name: "Archive card" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Archive this card?" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Archive card" }),
    );
    await waitFor(() =>
      expect(actions.archiveCardAction).toHaveBeenCalledTimes(1),
    );
    const formData = actions.archiveCardAction.mock.calls[0][0] as FormData;
    expect(formData.get("cardId")).toBe("card-1");
  });
});

describe("CardDetailSheet — live label set from the store (A1 / F4 round-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
    labelSectionSpy.latest = null;
  });

  it("forwards the STORE's live labels when the open card is selected (stale prop fallback)", () => {
    // The server `cardLabelIds` prop is stale (fetched before a remote attach);
    // the store's selectedCard.labels is the live snapshot (reducer-patched).
    useBoardStore.setState({
      selectedCardId: "card-1",
      selectedCard: {
        card: makeCard(),
        comments: [],
        activity: [],
        attachments: [],
        assignees: [],
        assignableMembers: [],
        labels: [
          { id: "label-1", name: "QA-Live", color: "#7C3AED" },
          { id: "label-2", name: "Bug", color: "#B04632" },
        ],
      },
    });

    renderSheet({
      cardLabelIds: [],
      boardLabels: [{ id: "label-1", name: "Stale Name", color: "#999999" }],
    });

    expect(labelSectionSpy.latest?.cardLabelIds).toEqual(["label-1", "label-2"]);
    // Chip metadata (name/color) comes from the LIVE store snapshot, overriding
    // the stale prop values.
    expect(labelSectionSpy.latest?.boardLabels).toContainEqual({
      id: "label-1",
      name: "QA-Live",
      color: "#7C3AED",
    });
    // A label absent from the stale prop list (remotely created) is unioned in.
    expect(labelSectionSpy.latest?.boardLabels).toContainEqual({
      id: "label-2",
      name: "Bug",
      color: "#B04632",
    });
  });

  it("falls back to the server props when no store selection matches", () => {
    renderSheet({ cardLabelIds: ["label-prop"], boardLabels: [{ id: "label-prop", name: "Prop", color: "#111" }] });

    expect(labelSectionSpy.latest?.cardLabelIds).toEqual(["label-prop"]);
  });
});

describe("CardDetailSheet — comments/activity load more (cap 50)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
  });

  function comment(id: string, content: string, createdAt: Date) {
    return {
      id,
      cardId: "card-1",
      userId: "u1",
      content,
      createdAt,
      updatedAt: createdAt,
      user: { id: "u1", name: "Alice", image: null },
    };
  }

  function activityEntry(
    id: string,
    action: "CREATED" | "UPDATED" | "MOVED" | "ARCHIVED" | "RESTORED" | "DELETED" | "COMMENTED",
    createdAt: Date,
  ) {
    return {
      id,
      workspaceId: "ws-1",
      boardId: "board-1",
      cardId: "card-1",
      userId: "u1",
      action,
      entityType: "CARD" as const,
      metadata: null,
      createdAt,
      user: { id: "u1", name: "Alice", image: null },
    };
  }

  it("shows a Load more button per section only when the server reports more", () => {
    renderSheet({
      comments: [comment("c1", "First", new Date("2026-01-01T00:00:00Z"))],
      commentsHasMore: true,
      activity: [activityEntry("a1", "CREATED", new Date("2026-01-01T00:00:00Z"))],
      activityHasMore: false,
    });

    expect(
      screen.getByRole("button", { name: "Load more comments" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more activity" }),
    ).not.toBeInTheDocument();
  });

  it("hides both Load more buttons when nothing is beyond the seed", () => {
    renderSheet({
      comments: [comment("c1", "First", new Date("2026-01-01T00:00:00Z"))],
      activity: [activityEntry("a1", "CREATED", new Date("2026-01-01T00:00:00Z"))],
    });

    expect(
      screen.queryByRole("button", { name: "Load more comments" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more activity" }),
    ).not.toBeInTheDocument();
  });

  it("appends the next comment page, dedupes by id, and keeps order", async () => {
    renderSheet({
      comments: [
        comment("c1", "First", new Date("2026-01-01T00:00:00Z")),
        comment("c2", "Second", new Date("2026-01-01T00:01:00Z")),
      ],
      commentsHasMore: true,
    });

    // Page includes a duplicate of c2 (a race/tie would surface the same row);
    // the sheet must not render it twice.
    actions.loadMoreCardDetailAction.mockResolvedValue({
      success: true,
      section: "comments",
      hasMore: false,
      items: [
        {
          id: "c2",
          content: "Second",
          createdAt: "2026-01-01T00:01:00.000Z",
          user: { id: "u1", name: "Alice", image: null },
        },
        {
          id: "c3",
          content: "Third",
          createdAt: "2026-01-01T00:02:00.000Z",
          user: { id: "u1", name: "Alice", image: null },
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Load more comments" }));

    // The cursor is the (createdAt, id) of the last *displayed* comment.
    await waitFor(
      () => {
        const fd = actions.loadMoreCardDetailAction.mock.calls[0][0] as FormData;
        expect(fd.get("section")).toBe("comments");
        expect(fd.get("cardId")).toBe("card-1");
        expect(fd.get("cursorCreatedAt")).toBe("2026-01-01T00:01:00.000Z");
        expect(fd.get("cursorId")).toBe("c2");
      },
      { timeout: 3000 },
    );

    await waitFor(() => expect(screen.getByText("Third")).toBeInTheDocument(), {
      timeout: 3000,
    });
    // Append + dedupe: each comment renders exactly once, oldest first.
    expect(
      screen
        .getAllByText(/^(First|Second|Third)$/)
        .map((el) => el.textContent),
    ).toEqual(["First", "Second", "Third"]);
    // Last page → affordance disappears.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Load more comments" }),
      ).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it("pages repeatedly while hasMore stays true, advancing the cursor", async () => {
    renderSheet({
      comments: [comment("c1", "First", new Date("2026-01-01T00:00:00Z"))],
      commentsHasMore: true,
    });

    actions.loadMoreCardDetailAction
      .mockResolvedValueOnce({
        success: true,
        section: "comments",
        hasMore: true,
        items: [
          {
            id: "c2",
            content: "Second",
            createdAt: "2026-01-01T00:01:00.000Z",
            user: { id: "u1", name: "Alice", image: null },
          },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        section: "comments",
        hasMore: false,
        items: [
          {
            id: "c3",
            content: "Third",
            createdAt: "2026-01-01T00:02:00.000Z",
            user: { id: "u1", name: "Alice", image: null },
          },
        ],
      });

    await user.click(screen.getByRole("button", { name: "Load more comments" }));
    await waitFor(() => expect(screen.getByText("Second")).toBeInTheDocument(), {
      timeout: 3000,
    });
    // The pending flag settles a tick after the page renders — wait for the
    // button to be interactive again before the next click.
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Load more comments" }),
        ).toBeEnabled(),
      { timeout: 3000 },
    );

    await user.click(screen.getByRole("button", { name: "Load more comments" }));
    await waitFor(() => expect(screen.getByText("Third")).toBeInTheDocument(), {
      timeout: 3000,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Load more comments" }),
      ).not.toBeInTheDocument(),
      { timeout: 3000 },
    );

    // Second call carried the cursor of the last *displayed* comment (c2).
    const fd2 = actions.loadMoreCardDetailAction.mock.calls[1][0] as FormData;
    expect(fd2.get("cursorId")).toBe("c2");
    expect(fd2.get("cursorCreatedAt")).toBe("2026-01-01T00:01:00.000Z");
  });

  it("appends activity pages and hides the button on the last page", async () => {
    renderSheet({
      activity: [activityEntry("a1", "CREATED", new Date("2026-01-01T00:00:00Z"))],
      activityHasMore: true,
    });

    actions.loadMoreCardDetailAction.mockResolvedValue({
      success: true,
      section: "activity",
      hasMore: false,
      items: [
        {
          id: "a2",
          action: "UPDATED",
          entityType: "CARD",
          createdAt: "2026-01-01T00:01:00.000Z",
          user: { id: "u1", name: "Alice", image: null },
          metadata: null,
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: "Load more activity" }));

    // The cursor is the (createdAt, id) of the last *displayed* activity row.
    await waitFor(
      () => {
        const fd = actions.loadMoreCardDetailAction.mock.calls[0][0] as FormData;
        expect(fd.get("section")).toBe("activity");
        expect(fd.get("cursorId")).toBe("a1");
        expect(fd.get("cursorCreatedAt")).toBe("2026-01-01T00:00:00.000Z");
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => expect(screen.getByText(/updated this card/)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Load more activity" }),
      ).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it("surfaces a failed load as full error text", async () => {
    renderSheet({
      comments: [comment("c1", "First", new Date("2026-01-01T00:00:00Z"))],
      commentsHasMore: true,
    });

    actions.loadMoreCardDetailAction.mockResolvedValue({
      success: false,
      error: "Card not found",
    });

    await user.click(screen.getByRole("button", { name: "Load more comments" }));

    await waitFor(() =>
      expect(screen.getByText("Card not found")).toBeInTheDocument(),
    );
    // Nothing was appended and the affordance stays (retryable) — the pending
    // flag settles a tick after the error commits, so wait for the button.
    expect(screen.getByText("First")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Load more comments" }),
      ).toBeInTheDocument(),
    );
  });
});

describe("CardDetailSheet — comment composer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
  });

  it("posts the comment when Enter is pressed in the textarea", async () => {
    actions.createCommentAction.mockResolvedValue({ success: true });
    renderSheet();

    const textarea = screen.getByPlaceholderText("Write a comment...");
    await user.type(textarea, "Nice work");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(actions.createCommentAction).toHaveBeenCalledTimes(1),
    );
    const formData = actions.createCommentAction.mock.calls[0][0] as FormData;
    expect(formData.get("cardId")).toBe("card-1");
    expect(formData.get("content")).toBe("Nice work");
    // Success clears the composer.
    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("posts the comment when the submit button is clicked", async () => {
    actions.createCommentAction.mockResolvedValue({ success: true });
    renderSheet();

    await user.type(
      screen.getByPlaceholderText("Write a comment..."),
      "Via button",
    );
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() =>
      expect(actions.createCommentAction).toHaveBeenCalledTimes(1),
    );
    const formData = actions.createCommentAction.mock.calls[0][0] as FormData;
    expect(formData.get("content")).toBe("Via button");
  });

  it("keeps Shift+Enter a newline instead of submitting", async () => {
    actions.createCommentAction.mockResolvedValue({ success: true });
    renderSheet();

    const textarea = screen.getByPlaceholderText("Write a comment...");
    await user.type(textarea, "line one{Shift>}{Enter}{/Shift}line two");

    await waitFor(() => expect(textarea).toHaveValue("line one\nline two"));
    expect(actions.createCommentAction).not.toHaveBeenCalled();
  });

  it("shows the empty-comment error on Enter instead of posting", async () => {
    renderSheet();

    const textarea = screen.getByPlaceholderText("Write a comment...");
    await user.click(textarea);
    await user.keyboard("{Enter}");

    expect(screen.getByText("Comment cannot be empty")).toBeInTheDocument();
    expect(actions.createCommentAction).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Close/reopen lifecycle (close-flash regression, fix/card-detail-close-flash)
//
// page.tsx keys CardDetailSheet by the server-selected card:
//   key={selectedCard?.id ?? "card-detail-sheet-closed"}
// so a card → no-card → card server re-render UNMOUNTS and REMOUNTS the sheet,
// destroying the dismissedCardId latch. The close-flash happens when an
// in-flight router.refresh() payload (fetched while ?cardId was still in the
// URL — queued autosave, socket reconnect, list:restored, drag resync) lands
// AFTER the close navigation: the server re-renders with the card selected
// again, the key flips back, and a fresh sheet mounts with open=true and
// dismissedCardId=null. The URL no longer selects a card, so the dialog must
// stay closed — the open state must be URL-authoritative, not server-payload
// authoritative.
//
// These tests drive the same sequences with a keyed harness, asserting the
// dialog never flashes open after close and that intentional reopens still
// work.
//
// The harness mirrors page.tsx: key follows the card prop, open=!!card.
function keyedSheet(
  card: CardDetailRecord | null,
  overrides: Partial<Parameters<typeof CardDetailSheet>[0]> = {},
) {
  return (
    <CardDetailSheet
      key={card?.id ?? "card-detail-sheet-closed"}
      open={Boolean(card)}
      card={card}
      comments={[]}
      commentsHasMore={false}
      activity={[]}
      activityHasMore={false}
      attachments={[]}
      assignees={[]}
      assignableMembers={[]}
      boardId="board-1"
      boardLabels={[]}
      cardLabelIds={[]}
      checklists={[]}
      canEdit
      canArchive={false}
      canComment
      {...overrides}
    />
  );
}

describe("CardDetailSheet — close/reopen lifecycle (close-flash regression)", () => {
  const card = makeCard();

  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
    urlParams.set("cardId", "card-1");
  });

  it("stays closed when a stale RSC payload remounts the sheet after close (the close-flash bug)", async () => {
    const { rerender } = render(keyedSheet(card));
    expect(screen.getByLabelText("Card title")).toBeInTheDocument();

    // User closes (outside click / X / Escape all funnel through
    // onOpenChange(false)) → handleClose: latch the dismissal and strip ?cardId.
    await user.click(screen.getByRole("button", { name: "Close card" }));
    expect(routerMock.replace).toHaveBeenCalledWith("/boards/board-1", {
      scroll: false,
    });

    // The close navigation lands: server renders with no selected card → the
    // key flips to the closed marker → the sheet unmounts (latch destroyed).
    urlParams.delete("cardId");
    rerender(keyedSheet(null));
    expect(screen.queryByLabelText("Card title")).not.toBeInTheDocument();

    // A STALE refresh payload (fetched while ?cardId was still in the URL)
    // lands after the close navigation: server re-renders with card-1 selected
    // again → key flips back → the sheet REMOUNTS with open=true. The URL has
    // no cardId, so the dialog must stay closed. This is the reported flash.
    rerender(keyedSheet(card));
    expect(screen.queryByLabelText("Card title")).not.toBeInTheDocument();
  });

  it("reopens the same card when the user intentionally navigates to it again", async () => {
    const { rerender } = render(keyedSheet(card));
    await user.click(screen.getByRole("button", { name: "Close card" }));

    urlParams.delete("cardId");
    rerender(keyedSheet(null));
    // Stale payload between close and reopen — must stay closed.
    rerender(keyedSheet(card));
    expect(screen.queryByLabelText("Card title")).not.toBeInTheDocument();

    // Intentional reopen: BoardContent.openCard pushes ?cardId again → the URL
    // and the server payload agree → the dialog opens.
    urlParams.set("cardId", "card-1");
    rerender(keyedSheet(card));
    expect(await screen.findByLabelText("Card title")).toBeInTheDocument();
  });

  it("reopens the same card when a stale payload kept the sheet mounted (latch is cleared once the URL drops the card)", async () => {
    const { rerender } = render(keyedSheet(card));
    expect(screen.getByLabelText("Card title")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close card" }));
    expect(routerMock.replace).toHaveBeenCalledWith("/boards/board-1", {
      scroll: false,
    });

    // The replace commits (URL loses cardId) but a stale payload keeps the
    // sheet MOUNTED with the same key — no remount, so the dismissal latch
    // would survive and block a later reopen.
    urlParams.delete("cardId");
    rerender(keyedSheet(card));
    await waitFor(() =>
      expect(screen.queryByLabelText("Card title")).not.toBeInTheDocument(),
    );

    // User re-clicks the same card: push re-adds ?cardId, same key → no
    // remount. The latch must have been cleared when the URL dropped the card.
    urlParams.set("cardId", "card-1");
    rerender(keyedSheet(card));
    expect(await screen.findByLabelText("Card title")).toBeInTheDocument();
  });

  it("Escape closes the dialog through the same handleClose path", async () => {
    const { rerender } = render(keyedSheet(card));
    expect(screen.getByLabelText("Card title")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(routerMock.replace).toHaveBeenCalledWith("/boards/board-1", {
      scroll: false,
    });

    urlParams.delete("cardId");
    rerender(keyedSheet(null));
    expect(screen.queryByLabelText("Card title")).not.toBeInTheDocument();
  });
});
