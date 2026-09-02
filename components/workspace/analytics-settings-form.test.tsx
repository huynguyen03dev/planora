import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  updateWorkspaceTimezoneAction: vi.fn(),
  updateWorkspaceRequireEstimateAction: vi.fn(),
}));

vi.mock("@/app/(authenticated)/(dashboard)/workspace/actions", () => actions);

import { AnalyticsSettingsForm } from "./analytics-settings-form";

const user = userEvent.setup();

function renderForm() {
  return render(
    <AnalyticsSettingsForm
      workspaceId="ws-1"
      timezone="UTC"
      requireEstimateBeforeDone={false}
    />,
  );
}

describe("AnalyticsSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.updateWorkspaceTimezoneAction.mockResolvedValue({ success: true });
    actions.updateWorkspaceRequireEstimateAction.mockResolvedValue({
      success: true,
    });
  });

  it("disables save until a value changes, and re-enables on revert", async () => {
    renderForm();
    const save = screen.getByRole("button", { name: "Save analytics settings" });
    expect(save).toBeDisabled();

    // Timezone edit → dirty → enabled.
    const timezone = screen.getByLabelText("Timezone");
    await user.clear(timezone);
    await user.type(timezone, "America/New_York");
    expect(save).toBeEnabled();

    // Reverting to the initial value clears the dirty state.
    await user.clear(timezone);
    await user.type(timezone, "UTC");
    expect(save).toBeDisabled();
  });

  it("treats the require-estimate toggle as a dirty change", async () => {
    renderForm();
    const save = screen.getByRole("button", { name: "Save analytics settings" });
    expect(save).toBeDisabled();

    await user.click(screen.getByLabelText(/Require estimate before done/));
    expect(save).toBeEnabled();
  });

  it("does not round-trip when nothing changed", async () => {
    renderForm();
    const save = screen.getByRole("button", { name: "Save analytics settings" });
    // Button is disabled, but guard against any path that still submits.
    await user.click(save).catch(() => undefined);
    expect(actions.updateWorkspaceTimezoneAction).not.toHaveBeenCalled();
    expect(actions.updateWorkspaceRequireEstimateAction).not.toHaveBeenCalled();
  });

  it("saves both settings, shows the success message, and resets dirty", async () => {
    renderForm();
    const save = screen.getByRole("button", { name: "Save analytics settings" });

    const timezone = screen.getByLabelText("Timezone");
    await user.clear(timezone);
    await user.type(timezone, "Asia/Ho_Chi_Minh");
    await user.click(save);

    expect(actions.updateWorkspaceTimezoneAction).toHaveBeenCalledWith(
      "ws-1",
      "Asia/Ho_Chi_Minh",
    );
    expect(actions.updateWorkspaceRequireEstimateAction).toHaveBeenCalledWith(
      "ws-1",
      false,
    );

    // Success feedback…
    expect(screen.getByRole("status")).toHaveTextContent(
      "Analytics settings saved",
    );

    // …and the form is clean again (initial synced to the saved draft).
    expect(save).toBeDisabled();
  });
});
