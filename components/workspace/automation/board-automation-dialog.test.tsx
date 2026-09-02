import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── hoisted mocks so `vi.mock` can reference them before the import graph runs ──
const { getBoardAutomationDataAction } = vi.hoisted(() => ({
  getBoardAutomationDataAction: vi.fn(),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions",
  () => ({ getBoardAutomationDataAction }),
);

// Mock the heavy AutomationContent subtree — keep the test focused on the
// dialog's lifecycle (open, load, error, data-passing).  We render a minimal
// inner that includes the text "New rule" so the "new rule entry is present"
// assertion is meaningful.
vi.mock("./automation-content", () => ({
  AutomationContent: () => (
    <div data-testid="automation-content">
      <span>Rules for this board</span>
      <button type="button">New rule</button>
      <p>7 rules active</p>
    </div>
  ),
}));

import { BoardAutomationDialog } from "./board-automation-dialog";

// ── helpers ──

const user = userEvent.setup({ pointerEventsCheck: 0 });

const SUCCESS_RESPONSE = {
  success: true as const,
  workspaceId: "ws-1",
  canManage: true,
  options: {
    boards: [{ id: "board-1", title: "My Board" }],
    lists: [],
    labels: [],
    members: [],
  },
  rules: [
    {
      id: "rule-1",
      name: "Set priority on create",
      triggerType: "card-created" as const,
      enabled: true,
      scope: "board" as const,
      scopeId: "board-1",
      actions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  logs: [],
  logsHasMore: false,
  lastRunByRule: {} as Record<string, string>,
};

function renderDialog(boardId = "board-1", boardTitle = "My Board") {
  render(
    <BoardAutomationDialog boardId={boardId} boardTitle={boardTitle} />,
  );
}

// ── tests ──

describe("BoardAutomationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Automation trigger button", () => {
    renderDialog();
    const trigger = screen.getByRole("button", { name: "Automation" });
    expect(trigger).toBeInTheDocument();
    // Narrow-screen toolbar: the label span hides below md (single icon row)
    // while the aria-label keeps the accessible name stable.
    expect(trigger).toHaveAttribute("aria-label", "Automation");
    const label = Array.from(trigger.querySelectorAll("span")).find(
      (span) => span.textContent === "Automation",
    );
    expect(label).toBeDefined();
    expect(label).toHaveClass("hidden", "md:inline");
  });

  it("opens the dialog on trigger click and fetches data lazily", async () => {
    getBoardAutomationDataAction.mockImplementation(
      () => new Promise(() => {}), // never resolves — keeps the loading state
    );

    renderDialog();

    expect(screen.queryByText("Automation")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Automation" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Automation" }));

    expect(
      screen.getByRole("heading", { name: "Automation" }),
    ).toBeInTheDocument();

    expect(getBoardAutomationDataAction).toHaveBeenCalledWith({
      boardId: "board-1",
    });
  });

  it("shows a loading skeleton while data is being fetched", async () => {
    getBoardAutomationDataAction.mockImplementation(
      () => new Promise(() => {}), // pending forever
    );

    renderDialog();
    await user.click(screen.getByRole("button", { name: "Automation" }));

    // The skeleton is marked aria-busy
    expect(screen.getByLabelText("Loading automation")).toBeInTheDocument();
    expect(
      screen.queryByTestId("automation-content"),
    ).not.toBeInTheDocument();
  });

  it("renders AutomationContent once data loads successfully", async () => {
    getBoardAutomationDataAction.mockResolvedValue(SUCCESS_RESPONSE);

    renderDialog();
    await user.click(screen.getByRole("button", { name: "Automation" }));

    await waitFor(() => {
      expect(screen.getByTestId("automation-content")).toBeInTheDocument();
    });

    // Title includes the board name in the description
    expect(screen.getByText(/My Board/)).toBeInTheDocument();
  });

  it('shows the "New rule" entry inside the loaded content', async () => {
    getBoardAutomationDataAction.mockResolvedValue(SUCCESS_RESPONSE);

    renderDialog();
    await user.click(screen.getByRole("button", { name: "Automation" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "New rule" }),
      ).toBeInTheDocument();
    });
  });

  it("displays an error message and a retry button when the fetch fails", async () => {
    getBoardAutomationDataAction.mockResolvedValue({
      success: false,
      error: "Something went wrong",
    });

    renderDialog();
    await user.click(screen.getByRole("button", { name: "Automation" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    const retryButton = screen.getByRole("button", { name: "Try again" });
    expect(retryButton).toBeInTheDocument();

    getBoardAutomationDataAction.mockResolvedValue(SUCCESS_RESPONSE);
    await user.click(retryButton);

    expect(getBoardAutomationDataAction).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(screen.getByTestId("automation-content")).toBeInTheDocument();
    });
  });

  it("re-fetches data every time the dialog opens", async () => {
    getBoardAutomationDataAction.mockResolvedValue(SUCCESS_RESPONSE);

    renderDialog();
    const trigger = screen.getByRole("button", { name: "Automation" });

    // Open → first fetch
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId("automation-content")).toBeInTheDocument();
    });
    expect(getBoardAutomationDataAction).toHaveBeenCalledTimes(1);

    // Close the dialog via Escape key
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByTestId("automation-content"),
      ).not.toBeInTheDocument();
    });

    // Open again → second fetch
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId("automation-content")).toBeInTheDocument();
    });
    expect(getBoardAutomationDataAction).toHaveBeenCalledTimes(2);
  });
});
