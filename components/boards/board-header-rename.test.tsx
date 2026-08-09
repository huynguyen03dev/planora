/**
 * BoardHeader — inline rename draft preservation (fix/card-detail-lifecycle-safety).
 *
 * The typed rename draft must survive both a failed save and a blur that lands
 * while the save is in flight. Browsers fire a blur when a focused element is
 * disabled, and the input is disabled while `isPending` — the old guard branch
 * (`!canEdit || !canSubmit || isPending`) reverted the draft and closed the
 * editor on that blur, silently discarding a rename that may still land.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  toggleBoardStarAction: vi.fn(),
  updateBoardAction: vi.fn(),
}));

vi.mock("@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store", () => ({
  useBoardStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ watchers: [], socketConnected: true }),
}));

vi.mock("@/app/(authenticated)/(dashboard)/boards/actions", () => actions);

// Mock heavy child dependencies so BoardHeader mounts in the test environment.
vi.mock("@/components/boards/archived-cards-dialog", () => ({
  ArchivedCardsDialog: () => <div data-testid="mocked-archived-dialog" />,
}));
vi.mock("@/components/boards/board-filter", () => ({
  BoardFilter: () => <div data-testid="board-filter" />,
}));
vi.mock("@/components/boards/board-menu", () => ({
  BoardMenu: () => <div data-testid="board-menu" />,
}));
vi.mock("@/components/workspace/automation/board-automation-dialog", () => ({
  BoardAutomationDialog: () => <div data-testid="board-automation" />,
}));
vi.mock("@/components/workspace/members/invite-member-dialog", () => ({
  InviteMemberDialog: () => <div data-testid="mocked-invite-dialog" />,
}));

import { BoardHeader } from "./board-header";

const user = userEvent.setup({ pointerEventsCheck: 0 });

const baseBoard = { id: "b-1", title: "Test Board", backgroundColor: null };

function renderBoard() {
  return render(
    <BoardHeader
      board={baseBoard}
      canEdit
      canDelete
      canArchiveCard
      archivedCards={[]}
      archivedLists={[]}
      starred={false}
    />,
  );
}

async function startRename() {
  await user.click(screen.getByRole("heading", { name: "Test Board" }));
  const input = screen.getByRole("textbox");
  await user.clear(input);
  await user.type(input, "Renamed Board");
  return input;
}

describe("BoardHeader — inline rename draft preservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the typed draft when a blur lands while the save is in flight (disabled input)", async () => {
    let resolveSave: ((v: { success: boolean }) => void) | null = null;
    actions.updateBoardAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    renderBoard();
    const input = await startRename();

    await user.keyboard("{Enter}"); // save starts; the input becomes disabled
    await waitFor(() =>
      expect(actions.updateBoardAction).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(input).toBeDisabled());

    // Browsers fire blur when a focused element becomes disabled; that blur
    // must not wipe the draft or exit edit mode.
    fireEvent.focusOut(input);
    expect(actions.updateBoardAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox")).toHaveValue("Renamed Board");

    resolveSave!({ success: true });
    // Success closes the editor; the rename landed.
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
  });

  it("keeps the typed draft and edit mode when the save fails", async () => {
    actions.updateBoardAction.mockResolvedValue({
      success: false,
      error: "Failed to update board. Please try again.",
    });

    renderBoard();
    await startRename();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(
        screen.getByText("Failed to update board. Please try again."),
      ).toBeInTheDocument(),
    );
    // The editor stays open with the draft intact so the user can retry.
    expect(screen.getByRole("textbox")).toHaveValue("Renamed Board");
  });

  it("reverts to the board title when blurring with an empty draft (nothing to save)", async () => {
    renderBoard();
    await user.click(screen.getByRole("heading", { name: "Test Board" }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.tab(); // blur with an empty title

    expect(actions.updateBoardAction).not.toHaveBeenCalled();
    // The editor closes and the last known title is restored.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Test Board" }),
      ).toBeInTheDocument(),
    );
  });
});
