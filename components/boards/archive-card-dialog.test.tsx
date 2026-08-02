import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ArchiveCardDialog } from "@/components/boards/archive-card-dialog";
import { UndoHost } from "@/components/undo/undo-snackbar";

/**
 * US-083 W8 — the shared card-archive seam (used by the board card face AND
 * the card-detail sheet) is one of exactly two undo offer points (decision
 * 0031). On archive success it offers undo with the call-site card id/title;
 * on failure it surfaces the error through the caller's onError and offers
 * nothing.
 */
const actions = vi.hoisted(() => ({
  archiveCardAction: vi.fn(),
  restoreCardAction: vi.fn(),
}));
vi.mock(
  "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions",
  () => actions,
);
vi.mock("next/navigation", () => ({ usePathname: () => "/boards/board-1" }));

function renderDialog() {
  const onOpenChange = vi.fn();
  const onError = vi.fn();
  // Stateful wrapper: the dialog must actually close on success, because an
  // open Radix modal sets aria-hidden on the rest of the tree — a hidden
  // snackbar is invisible to RTL queries (and to users, correctly).
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <UndoHost>
        <ArchiveCardDialog
          cardId="card-1"
          cardTitle="Card one"
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            onOpenChange(next);
          }}
          onError={onError}
        />
      </UndoHost>
    );
  }
  render(<Harness />);
  return { onOpenChange, onError };
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.archiveCardAction.mockResolvedValue({ success: true });
  actions.restoreCardAction.mockResolvedValue({ success: true });
});

describe("ArchiveCardDialog — W8 undo offer seam", () => {
  it("archive success offers undo with the call-site card id; Undo restores through the real action", async () => {
    const { onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Archive card" }));

    // The offer survives the dialog close: the host lives at board level.
    expect(await screen.findByRole("status")).toHaveTextContent("Card archived");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    fireEvent.click(screen.getByRole("button", { name: /^Undo archive of/ }));
    expect(actions.restoreCardAction).toHaveBeenCalledTimes(1);
    const fd = actions.restoreCardAction.mock.calls[0][0] as FormData;
    expect(fd.get("cardId")).toBe("card-1");

    expect(await screen.findByRole("status")).toHaveTextContent("Card restored");
  });

  it("archive failure surfaces the error via onError and offers no undo", async () => {
    actions.archiveCardAction.mockResolvedValue({ success: false, error: "Card not found" });
    const { onOpenChange, onError } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Archive card" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Card not found"));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
