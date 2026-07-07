import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The dialog calls Server Actions and next/navigation; both are boundaries we
// stub so the test exercises the builder's own logic, not the server.
const { createRuleAction, updateRuleAction, refresh } = vi.hoisted(() => ({
  createRuleAction: vi.fn(),
  updateRuleAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock(
  "@/app/(authenticated)/(dashboard)/workspace/[slug]/automation/actions",
  () => ({ createRuleAction, updateRuleAction }),
);

import { RuleBuilderDialog } from "./rule-builder-dialog";
import type { AutomationOptions } from "./types";

const user = userEvent.setup({ pointerEventsCheck: 0 });

const OPTIONS: AutomationOptions = {
  boards: [{ id: "board-1", title: "Board One" }],
  lists: [{ id: "list-1", title: "To Do", boardId: "board-1", boardTitle: "Board One" }],
  labels: [
    { id: "label-1", name: "Bug", color: "red", boardId: "board-1", boardTitle: "Board One" },
  ],
  members: [{ userId: "user-1", name: "Alice" }],
};

function renderDialog(notify = vi.fn()) {
  render(
    <RuleBuilderDialog
      workspaceId="ws-1"
      options={OPTIONS}
      notify={notify}
      trigger={<button type="button">New rule</button>}
    />,
  );
  return { notify };
}

describe("RuleBuilderDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stays closed until the trigger is clicked", async () => {
    renderDialog();
    expect(screen.queryByText("New automation rule")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New rule" }));
    expect(screen.getByText("New automation rule")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    // A fresh rule starts with exactly one action step.
    expect(screen.getAllByRole("button", { name: "Move action up" })).toHaveLength(1);
  });

  it("adds and removes action steps", async () => {
    renderDialog();
    await user.click(screen.getByRole("button", { name: "New rule" }));

    await user.click(screen.getByRole("button", { name: "Add action" }));
    expect(screen.getAllByRole("button", { name: "Move action up" })).toHaveLength(2);

    // The first step's remove button becomes enabled once >1 step exists.
    const removeButtons = screen.getAllByRole("button", { name: /Remove .* action/ });
    await user.click(removeButtons[0]);
    expect(screen.getAllByRole("button", { name: "Move action up" })).toHaveLength(1);
  });

  it("does not submit without a name", async () => {
    renderDialog();
    await user.click(screen.getByRole("button", { name: "New rule" }));

    await user.click(screen.getByRole("button", { name: "Create rule" }));
    expect(createRuleAction).not.toHaveBeenCalled();
  });

  it("submits a valid rule, notifies, and refreshes", async () => {
    createRuleAction.mockResolvedValue({ success: true, warnings: [] });
    const { notify } = renderDialog();
    await user.click(screen.getByRole("button", { name: "New rule" }));

    await user.type(screen.getByLabelText("Name"), "Set priority on create");
    await user.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() => expect(createRuleAction).toHaveBeenCalledTimes(1));
    expect(createRuleAction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        name: "Set priority on create",
        triggerType: "card-created",
      }),
    );
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Rule created", "info"));
    expect(refresh).toHaveBeenCalled();
    // Dialog closes on success.
    await waitFor(() =>
      expect(screen.queryByText("New automation rule")).not.toBeInTheDocument(),
    );
  });

  it("surfaces a server error without closing", async () => {
    createRuleAction.mockResolvedValue({ success: false, error: "Rule name already exists" });
    const { notify } = renderDialog();
    await user.click(screen.getByRole("button", { name: "New rule" }));

    await user.type(screen.getByLabelText("Name"), "Dup rule");
    await user.click(screen.getByRole("button", { name: "Create rule" }));

    await waitFor(() =>
      expect(screen.getByText("Rule name already exists")).toBeInTheDocument(),
    );
    expect(notify).not.toHaveBeenCalled();
    expect(screen.getByText("New automation rule")).toBeInTheDocument();
  });
});
