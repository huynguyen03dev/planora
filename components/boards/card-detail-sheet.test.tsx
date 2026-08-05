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
  archiveCardAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/boards/board-1",
  useSearchParams: () => new URLSearchParams(),
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
  useMentionAutocomplete: () => ({
    open: false,
    items: [],
    activeIndex: 0,
    setActiveIndex: vi.fn(),
    setFloating: vi.fn(),
    floatingStyles: {},
    listboxId: "mentions",
    optionId: (i: number) => `mention-${i}`,
    selectMember: vi.fn(),
    comboboxProps: {},
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
      activity={[]}
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
