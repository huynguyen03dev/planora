import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { useUndo } from "@/components/undo/undo-snackbar";
import { UndoHost } from "@/components/undo/undo-snackbar";
import type { UndoOffer } from "@/lib/undo";

/**
 * US-083 W8 — undo host/state machine (RTL). The host is mounted at the
 * board/provider level and owns the snackbar lifecycle: latest offer wins,
 * 8s offer TTL, manual dismiss, navigation dismissal, in-flight state,
 * pessimistic restore handling, polite `role="status"` success vs assertive
 * `role="alert"` failure, thrown actions never stick the UI, no focus steal.
 */

const actions = vi.hoisted(() => ({
  restoreCardAction: vi.fn(),
  restoreListAction: vi.fn(),
}));
vi.mock(
  "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions",
  () => actions,
);

const nav = vi.hoisted(() => ({ pathname: "/boards/board-1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
}));

const CARD_OFFER: UndoOffer = { kind: "card", id: "card-1", label: "Card one" };
const LIST_OFFER: UndoOffer = { kind: "list", id: "list-1", label: "List one" };

/** Probe that exposes the host's context so tests drive offers directly. */
function Probe({ offer }: { offer: UndoOffer }) {
  const { offerUndo } = useUndo();
  return <button onClick={() => offerUndo(offer)}>probe-offer</button>;
}

function renderHost(offer: UndoOffer) {
  return render(
    <UndoHost>
      <Probe offer={offer} />
    </UndoHost>,
  );
}

function undoButton() {
  // The button carries a rich aria-label ("Undo archive of <label>"); the
  // visible copy ("Undo" / "Restoring…") is the in-flight indicator.
  return screen.getByRole("button", { name: /^Undo archive of/ });
}

beforeEach(() => {
  vi.useFakeTimers();
  actions.restoreCardAction.mockReset();
  actions.restoreListAction.mockReset();
  actions.restoreCardAction.mockResolvedValue({ success: true });
  actions.restoreListAction.mockResolvedValue({ success: true });
  nav.pathname = "/boards/board-1";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("UndoHost — offer lifecycle", () => {
  it("offering a card archive shows a polite status snackbar with Undo; no focus steal", () => {
    renderHost(CARD_OFFER);
    const trigger = screen.getByRole("button", { name: "probe-offer" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);

    const snackbar = screen.getByRole("status");
    expect(snackbar).toHaveTextContent("Card archived");
    expect(undoButton()).toBeVisible();
    // No autofocus: focus stays where the user left it.
    expect(document.activeElement).toBe(trigger);
  });

  it("latest offer wins: a second offer replaces the first and restarts the clock", () => {
    render(
      <UndoHost>
        <Probe offer={CARD_OFFER} />
        <Probe offer={LIST_OFFER} />
      </UndoHost>,
    );
    const [cardProbe, listProbe] = screen.getAllByRole("button", { name: "probe-offer" });

    fireEvent.click(cardProbe);
    expect(screen.getByRole("status")).toHaveTextContent("Card archived");

    fireEvent.click(listProbe);
    expect(screen.getByRole("status")).toHaveTextContent("List archived");
    // The replaced offer must be gone, not stacked.
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("manual dismiss (X) clears the offered snackbar", () => {
    renderHost(CARD_OFFER);
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    expect(screen.getByRole("status")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("the offer expires after the 8s TTL", () => {
    renderHost(CARD_OFFER);
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    expect(screen.getByRole("status")).toBeVisible();

    act(() => vi.advanceTimersByTime(7_999));
    expect(screen.getByRole("status")).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("navigation dismisses the snackbar", () => {
    renderHost(CARD_OFFER);
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    expect(screen.getByRole("status")).toBeVisible();

    nav.pathname = "/boards/board-2";
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" })); // force re-render

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("non-eligible kinds are ignored (eligibility is enforced at the host too)", () => {
    render(
      <UndoHost>
        <Probe offer={{ kind: "permanent-delete" as UndoOffer["kind"], id: "x", label: "x" }} />
      </UndoHost>,
    );
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("UndoHost — undo execution (pessimistic, real restore actions)", () => {
  it("card Undo calls restoreCardAction with the call-site cardId and shows polite success", async () => {
    renderHost(CARD_OFFER);
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    fireEvent.click(undoButton());

    expect(actions.restoreCardAction).toHaveBeenCalledTimes(1);
    const fd = actions.restoreCardAction.mock.calls[0][0] as FormData;
    expect(fd.get("cardId")).toBe("card-1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Card restored");
  });

  it("list Undo calls restoreListAction with the call-site listId", async () => {
    renderHost(LIST_OFFER);
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    fireEvent.click(undoButton());

    expect(actions.restoreListAction).toHaveBeenCalledTimes(1);
    const fd = actions.restoreListAction.mock.calls[0][0] as FormData;
    expect(fd.get("listId")).toBe("list-1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent("List restored");
  });

  it("success status self-dismisses after the success TTL", async () => {
    renderHost(CARD_OFFER);
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    fireEvent.click(undoButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Card restored");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("failure shows the action's own error as an assertive alert; Dismiss clears it", async () => {
    actions.restoreCardAction.mockResolvedValue({
      success: false,
      error: "Restore the list first.",
    });
    renderHost(CARD_OFFER);
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    fireEvent.click(undoButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Restore the list first.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a thrown action lands on a generic failure alert — the UI never sticks in-flight", async () => {
    actions.restoreCardAction.mockRejectedValue(new Error("network"));
    renderHost(CARD_OFFER);
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    fireEvent.click(undoButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't restore the card. Please try again.",
    );

    // The host is usable again: a fresh offer works and can run another undo.
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    expect(screen.getByRole("status")).toHaveTextContent("Card archived");
    fireEvent.click(undoButton());
    expect(actions.restoreCardAction).toHaveBeenCalledTimes(2);
  });

  it("in-flight: Undo shows Restoring…, is disabled, and a second click is ignored", async () => {
    let resolveAction: (value: { success: true }) => void = () => {};
    actions.restoreCardAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    renderHost(CARD_OFFER);
    fireEvent.click(screen.getByRole("button", { name: "probe-offer" }));
    fireEvent.click(undoButton());

    const restoring = undoButton();
    expect(restoring).toHaveTextContent("Restoring…");
    expect(restoring).toBeDisabled();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeDisabled();

    // A second click while in flight must not start a second restore.
    fireEvent.click(restoring);
    expect(actions.restoreCardAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction({ success: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Card restored");
  });

  it("RED: a stale success from offer A cannot overwrite a newer offer B — B stays offered with its own Undo", async () => {
    let resolveA: (value: { success: true }) => void = () => {};
    actions.restoreCardAction.mockReturnValue(
      new Promise((resolve) => {
        resolveA = resolve;
      }),
    );
    render(
      <UndoHost>
        <Probe offer={CARD_OFFER} />
        <Probe offer={LIST_OFFER} />
      </UndoHost>,
    );
    const [cardProbe, listProbe] = screen.getAllByRole("button", { name: "probe-offer" });

    // A: card undo starts and stays in flight.
    fireEvent.click(cardProbe);
    fireEvent.click(undoButton());
    expect(actions.restoreCardAction).toHaveBeenCalledTimes(1);

    // B is offered while A is in flight — its Undo is present but disabled
    // until A's outcome lands (one undo at a time).
    fireEvent.click(listProbe);
    expect(screen.getByRole("status")).toHaveTextContent("List archived");
    expect(undoButton()).toBeDisabled();

    // A resolves success — the stale outcome must NOT overwrite B.
    await act(async () => {
      resolveA({ success: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    const snackbar = screen.getByRole("status");
    expect(snackbar).toHaveTextContent("List archived");
    expect(snackbar).not.toHaveTextContent("Card restored");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // B's own Undo is intact and works.
    expect(undoButton()).toBeEnabled();
    fireEvent.click(undoButton());
    expect(actions.restoreListAction).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent("List restored");
  });

  it("RED: a stale failure from offer A cannot overwrite a newer offer B", async () => {
    let resolveA: (value: { success: false; error: string }) => void = () => {};
    actions.restoreCardAction.mockReturnValue(
      new Promise((resolve) => {
        resolveA = resolve;
      }),
    );
    render(
      <UndoHost>
        <Probe offer={CARD_OFFER} />
        <Probe offer={LIST_OFFER} />
      </UndoHost>,
    );
    const [cardProbe, listProbe] = screen.getAllByRole("button", { name: "probe-offer" });

    fireEvent.click(cardProbe);
    fireEvent.click(undoButton());
    fireEvent.click(listProbe);
    expect(screen.getByRole("status")).toHaveTextContent("List archived");

    // A resolves FAILURE — B must stay offered; no alert from A's outcome.
    await act(async () => {
      resolveA({ success: false, error: "Restore the list first." });
      await vi.advanceTimersByTimeAsync(0);
    });
    const snackbar = screen.getByRole("status");
    expect(snackbar).toHaveTextContent("List archived");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(undoButton());
    expect(actions.restoreListAction).toHaveBeenCalledTimes(1);
  });
});
