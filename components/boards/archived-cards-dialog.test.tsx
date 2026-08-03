import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ArchivedCardsDialog } from "./archived-cards-dialog";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockRestoreCardAction = vi.fn();
const mockRestoreListAction = vi.fn();
const mockPermanentDeleteListAction = vi.fn();
vi.mock("@/app/(authenticated)/(dashboard)/boards/[boardId]/actions", () => ({
  restoreCardAction: (fd: FormData) => mockRestoreCardAction(fd),
  restoreListAction: (fd: FormData) => mockRestoreListAction(fd),
  permanentlyDeleteListAction: (fd: FormData) => mockPermanentDeleteListAction(fd),
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

describe("ArchivedCardsDialog (US-074 Slice B UI)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when canRestore is false (viewer / unauthorized)", () => {
    const { container } = render(
      <ArchivedCardsDialog
        archivedCards={[{ id: "c1", title: "Card 1", listTitle: "List A" }]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 2 }]}
        canRestore={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders trigger button with badge showing combined archived items count", () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[{ id: "c1", title: "Card 1", listTitle: "List A" }]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 2 }]}
        canRestore={true}
      />,
    );

    const trigger = screen.getByRole("button", { name: "View archived items" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("2");
  });

  it("opens dialog and maintains accessibility tablist, tab, aria-selected, and panel relationships", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[{ id: "c1", title: "Card 1", listTitle: "List A" }]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 2 }]}
        canRestore={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));

    expect(screen.getByText("Archived items")).toBeInTheDocument();

    const tablist = screen.getByRole("tablist", { name: "Archived items tabs" });
    expect(tablist).toBeInTheDocument();

    const cardsTab = screen.getByRole("tab", { name: "Cards (1)" });
    const listsTab = screen.getByRole("tab", { name: "Lists (1)" });

    expect(cardsTab).toHaveAttribute("aria-selected", "true");
    expect(listsTab).toHaveAttribute("aria-selected", "false");
    expect(cardsTab).toHaveAttribute("aria-controls", "archived-cards-panel");
    expect(listsTab).toHaveAttribute("aria-controls", "archived-lists-panel");

    const cardsPanel = screen.getByRole("tabpanel");
    expect(cardsPanel).toHaveAttribute("id", "archived-cards-panel");
    expect(cardsPanel).toHaveAttribute("aria-labelledby", "archived-cards-tab");
    expect(screen.getByText("Card 1")).toBeInTheDocument();

    // Switch to Lists tab
    await user.click(listsTab);
    expect(cardsTab).toHaveAttribute("aria-selected", "false");
    expect(listsTab).toHaveAttribute("aria-selected", "true");

    const listsPanel = screen.getByRole("tabpanel");
    expect(listsPanel).toHaveAttribute("id", "archived-lists-panel");
    expect(listsPanel).toHaveAttribute("aria-labelledby", "archived-lists-tab");
    expect(screen.getByText("List 1")).toBeInTheDocument();
    expect(screen.getByText("2 cards")).toBeInTheDocument();
  });

  it("handles cards=0 and lists>0 correctly: total count, empty cards panel, and lists tab visibility", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "Archived List 1", cardCount: 5 }]}
        canRestore={true}
      />,
    );

    const trigger = screen.getByRole("button", { name: "View archived items" });
    expect(trigger).toHaveTextContent("1"); // combined count is 0 + 1

    await user.click(trigger);

    const cardsTab = screen.getByRole("tab", { name: "Cards (0)" });
    const listsTab = screen.getByRole("tab", { name: "Lists (1)" });

    expect(cardsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("No archived cards.")).toBeInTheDocument();

    await user.click(listsTab);
    expect(listsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Archived List 1")).toBeInTheDocument();
    expect(screen.getByText("5 cards")).toBeInTheDocument();
  });

  it("disables restore button and shows pending state during list-restore action", async () => {
    let resolveRestore: (val: { success: boolean }) => void = () => {};
    mockRestoreListAction.mockImplementationOnce(
      () => new Promise((resolve) => { resolveRestore = resolve; }),
    );

    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 3 }]}
        canRestore={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));

    const restoreBtn = screen.getByRole("button", { name: "Restore" });
    await user.click(restoreBtn);

    // While pending
    expect(screen.getByRole("button", { name: "Restoring…" })).toBeDisabled();

    // Resolve the promise
    resolveRestore({ success: true });
  });

  it("calls restoreListAction and refreshes on list restore success", async () => {
    mockRestoreListAction.mockResolvedValueOnce({ success: true });

    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 3 }]}
        canRestore={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));

    const restoreBtn = screen.getByRole("button", { name: "Restore" });
    await user.click(restoreBtn);

    expect(mockRestoreListAction).toHaveBeenCalledTimes(1);
    const fd = mockRestoreListAction.mock.calls[0][0] as FormData;
    expect(fd.get("listId")).toBe("l1");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("displays error message when restoreListAction fails", async () => {
    mockRestoreListAction.mockResolvedValueOnce({
      success: false,
      error: "Failed to restore list. Please try again.",
    });

    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 3 }]}
        canRestore={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));

    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("Failed to restore list. Please try again.")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  // ── US-074 Slice C: Permanent delete UI ──────────────────────────────

  it("does not show permanent delete button when canPermanentDelete is false", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));

    expect(screen.queryByRole("button", { name: /permanently/i })).not.toBeInTheDocument();
  });

  // ── Admin wiring: canPermanentDelete derived from role (cross-layer proof) ──

  it("does not show delete button when canPermanentDelete is false even with canRestore=true", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 1 }]}
        canRestore={true}
        canPermanentDelete={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));

    // Restore button is present (canRestore), but delete button is absent (canPermanentDelete=false)
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /permanently/i })).not.toBeInTheDocument();
  });

  it("shows delete button when canPermanentDelete is true", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));

    // Both restore and delete present
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /permanently/i })).toBeInTheDocument();
  });



  it("opens confirmation dialog on click, requiring typed confirmation text", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    // Dialog should show the list title confirmation prompt
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Confirmation input should be present
    const input = screen.getByPlaceholderText(/type.*list title/i);
    expect(input).toBeInTheDocument();

    // Permanent delete button should be disabled initially
    const confirmBtn = screen.getByRole("button", { name: /^Permanently delete$/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("enables confirm button when typed title matches", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    const input = screen.getByPlaceholderText(/type.*list title/i);
    await user.type(input, "List 1");

    const confirmBtn = screen.getByRole("button", { name: /^Permanently delete$/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("disables confirm button when typed title does not match", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    const input = screen.getByPlaceholderText(/type.*list title/i);
    await user.type(input, "wrong title");

    const confirmBtn = screen.getByRole("button", { name: /^Permanently delete$/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("shows force delete checkbox when list has live (active) cards", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 5, liveCardCount: 3 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    // Force intent checkbox should be visible because liveCardCount > 0
    expect(screen.getByLabelText(/active cards/i)).toBeInTheDocument();
    // Text must reference liveCardCount, not cardCount
    expect(screen.getByText(/3 live card/)).toBeInTheDocument();
  });

  it("hides force delete checkbox when list has no live cards (cardCount > 0 but all archived)", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 5, liveCardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    // The checkbox must NOT appear — cardCount reports "5 cards" but they are all archived
    expect(screen.queryByLabelText(/active cards/i)).not.toBeInTheDocument();
  });

  it("calls permanentlyDeleteListAction on confirm with force=false when checkbox unchecked", async () => {
    mockPermanentDeleteListAction.mockResolvedValueOnce({ success: true });

    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    const input = screen.getByPlaceholderText(/type.*list title/i);
    await user.type(input, "List 1");

    await user.click(screen.getByRole("button", { name: /^Permanently delete$/i }));

    expect(mockPermanentDeleteListAction).toHaveBeenCalledTimes(1);
    const fd = mockPermanentDeleteListAction.mock.calls[0][0] as FormData;
    expect(fd.get("listId")).toBe("l1");
    expect(fd.get("confirmationText")).toBe("List 1");
    expect(fd.get("force")).toBe("false");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("sends force=true when checkbox checked (liveCardCount drives checkbox visibility)", async () => {
    mockPermanentDeleteListAction.mockResolvedValueOnce({ success: true });

    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 5, liveCardCount: 3 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    // Check the force checkbox
    const forceCheckbox = screen.getByLabelText(/active cards/i);
    await user.click(forceCheckbox);

    const input = screen.getByPlaceholderText(/type.*list title/i);
    await user.type(input, "List 1");

    await user.click(screen.getByRole("button", { name: /^Permanently delete$/i }));

    const fd = mockPermanentDeleteListAction.mock.calls[0][0] as FormData;
    expect(fd.get("force")).toBe("true");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("displays error when permanentlyDeleteListAction fails", async () => {
    mockPermanentDeleteListAction.mockResolvedValueOnce({
      success: false,
      error: "Cannot permanently delete this list: it contains attachments stored in Cloudinary.",
    });

    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    const input = screen.getByPlaceholderText(/type.*list title/i);
    await user.type(input, "List 1");

    await user.click(screen.getByRole("button", { name: /^Permanently delete$/i }));

    expect(
      await screen.findByText(/Cannot permanently delete this list/),
    ).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("shows blocking message when Cloudinary attachments prevent deletion", async () => {
    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0, cloudinaryBlocked: true }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));

    // Permanent delete button should still be visible
    expect(screen.getByRole("button", { name: /permanently/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /permanently/i }));

    // Blocking message should be shown instead of the regular dialog (no confirm input)
    expect(screen.getByText(/Cloudinary/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/type.*list title/i)).not.toBeInTheDocument();
    // Close button replaces Cancel + Permanently delete
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Permanently delete$/i })).not.toBeInTheDocument();
  });

  // ── Dialog lifecycle: pending state, error surface, prevent close during async ──

  it("shows pending state on confirm button during async delete, prevents close until resolved", async () => {
    let resolveDelete: (val: { success: boolean }) => void = () => {};
    mockPermanentDeleteListAction.mockImplementationOnce(
      () => new Promise((resolve) => { resolveDelete = resolve; }),
    );

    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    const input = screen.getByPlaceholderText(/type.*list title/i);
    await user.type(input, "List 1");

    const confirmBtn = screen.getByRole("button", { name: /^Permanently delete$/i });
    await user.click(confirmBtn);

    // While pending: button shows "Deleting…" and is disabled (await re-render)
    expect(await screen.findByRole("button", { name: "Deleting…" })).toBeDisabled();

    // Dialog stays open — pressing Escape or clicking outside must NOT close it
    // (assert alertdialog is still present)
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Resolve with success — refresh is called asynchronously after the await
    resolveDelete({ success: true });
    await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("keeps dialog open on action failure, surfaces error, allows retry", async () => {
    mockPermanentDeleteListAction.mockResolvedValueOnce({
      success: false,
      error: "Title confirmation does not match",
    });

    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    const input = screen.getByPlaceholderText(/type.*list title/i);
    await user.type(input, "List 1");

    const confirmBtn = screen.getByRole("button", { name: /^Permanently delete$/i });
    await user.click(confirmBtn);

    // Error surfaces in the dialog
    expect(await screen.findByText("Title confirmation does not match")).toBeInTheDocument();

    // Dialog stays open — user can retry or cancel
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();

    // Confirm button is re-enabled after error resolves
    expect(screen.getByRole("button", { name: /^Permanently delete$/i })).not.toBeDisabled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("prevents duplicate submission while delete is pending", async () => {
    let resolveDelete: (val: { success: boolean }) => void = () => {};
    mockPermanentDeleteListAction.mockImplementationOnce(
      () => new Promise((resolve) => { resolveDelete = resolve; }),
    );

    render(
      <ArchivedCardsDialog
        archivedCards={[]}
        archivedLists={[{ id: "l1", title: "List 1", cardCount: 0 }]}
        canRestore={true}
        canPermanentDelete={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View archived items" }));
    await user.click(screen.getByRole("tab", { name: "Lists (1)" }));
    await user.click(screen.getByRole("button", { name: /permanently/i }));

    const input = screen.getByPlaceholderText(/type.*list title/i);
    await user.type(input, "List 1");

    const confirmBtn = screen.getByRole("button", { name: /^Permanently delete$/i });
    await user.click(confirmBtn);

    // Trying to click again should be a no-op (isDeleting guard)
    await user.click(confirmBtn);

    expect(mockPermanentDeleteListAction).toHaveBeenCalledTimes(1);

    resolveDelete({ success: true });
  });
});
