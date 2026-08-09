/**
 * CreateBoardModal — synchronous same-tick single-flight (fix/card-detail-lifecycle-safety).
 *
 * `isPending` from useTransition only flips on the next render, so a double
 * submit in the same tick (Enter + click, or a repeated Enter before the
 * pending render) would create the board twice. The submitting ref guards the
 * first submit synchronously and releases on completion or failure, so a
 * retry after either always works.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({
  createBoardAction: vi.fn(),
}));
const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/(authenticated)/(dashboard)/boards/actions", () => actions);
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

import { CreateBoardModal } from "./create-board-modal";

const user = userEvent.setup({ pointerEventsCheck: 0 });

function renderModal(onClose: () => void = vi.fn()) {
  render(<CreateBoardModal workspaceId="ws-1" open onClose={onClose} />);
  return { onClose };
}

function submitForm() {
  const input = screen.getByLabelText("Board title");
  fireEvent.submit(input.closest("form")!);
}

describe("CreateBoardModal — synchronous single-flight submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores a second submit in the same tick (single-flight)", async () => {
    let resolveCreate: ((v: { success: boolean; boardId?: string }) => void) | null =
      null;
    actions.createBoardAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderModal();

    const input = screen.getByLabelText("Board title");
    await user.type(input, "Q2 Planning");

    // Two submits in the same tick (Enter + button click before the pending
    // render flips): only the first reaches the action.
    submitForm();
    submitForm();

    expect(actions.createBoardAction).toHaveBeenCalledTimes(1);

    resolveCreate!({ success: true, boardId: "b-2" });
    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith("/boards/b-2"),
    );
  });

  it("releases the guard after a failed submit so a retry works", async () => {
    actions.createBoardAction
      .mockResolvedValueOnce({
        success: false,
        error: "Failed to create board. Please try again.",
      })
      .mockResolvedValueOnce({ success: true, boardId: "b-2" });
    renderModal();

    const input = screen.getByLabelText("Board title");
    await user.type(input, "Q2 Planning");

    submitForm();
    await waitFor(() =>
      expect(
        screen.getByText("Failed to create board. Please try again."),
      ).toBeInTheDocument(),
    );

    // The guard released on failure — the same form submits again.
    submitForm();
    await waitFor(() =>
      expect(actions.createBoardAction).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith("/boards/b-2"),
    );
  });

  it("surfaces a generic error on a thrown action and allows a retry", async () => {
    actions.createBoardAction
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ success: true, boardId: "b-2" });
    renderModal();

    const input = screen.getByLabelText("Board title");
    await user.type(input, "Q2 Planning");

    submitForm();
    // The rejection is caught (no unhandled rejection): exactly one call and
    // a visible generic error.
    await waitFor(() =>
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(actions.createBoardAction).toHaveBeenCalledTimes(1);

    // The guard released on the rejection — the same form retries successfully.
    submitForm();
    await waitFor(() =>
      expect(actions.createBoardAction).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith("/boards/b-2"),
    );
  });

  it("closes and resets on success; a later open can submit again", async () => {
    actions.createBoardAction.mockResolvedValue({ success: true, boardId: "b-2" });
    const { onClose } = renderModal();

    const input = screen.getByLabelText("Board title");
    await user.type(input, "Q2 Planning");
    submitForm();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith("/boards/b-2"),
    );
    // resetState cleared the draft for the next open.
    expect(input).toHaveValue("");
  });
});

describe("CreateBoardModal — scoped error announcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("announces a failed create via role=alert wired to the title field", async () => {
    actions.createBoardAction.mockResolvedValueOnce({
      success: false,
      error: "Failed to create board. Please try again.",
    });
    renderModal();

    const input = screen.getByLabelText("Board title");
    await user.type(input, "Q2 Planning");
    submitForm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Failed to create board. Please try again.",
    );
    expect(alert).toHaveAttribute("id", "create-board-error");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "create-board-error");
  });
});
