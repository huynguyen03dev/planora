import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CardCompletionToggle } from "./card-completion-toggle";

// ── Mock Server Action ──────────────────────────────────────────────────────
const actions = vi.hoisted(() => ({
  toggleCardCompletionAction: vi.fn(),
}));

// ── Mock next/navigation ────────────────────────────────────────────────────
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: mockRefresh, push: vi.fn() }),
  usePathname: () => "/boards/board-1",
  useSearchParams: () => new URLSearchParams(),
}));

// ── Mock the Server Action module ───────────────────────────────────────────
vi.mock(
  "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions",
  () => actions,
);

// ── Shared user instance (Radix compat) ─────────────────────────────────────
const user = userEvent.setup({ pointerEventsCheck: 0 });

// ── Test Suite ──────────────────────────────────────────────────────────────
describe("CardCompletionToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering: canEdit=true ───────────────────────────────────────────────

  it("renders as not completed (circle icon, aria-checked=false)", () => {
    render(
      <CardCompletionToggle
        cardId="card-1"
        completedAt={null}
        canEdit
        variant="face"
      />,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: "Mark card complete",
    });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute("aria-checked", "false");
    expect(checkbox).not.toBeDisabled();
  });

  it("renders as completed (checkmark icon, aria-checked=true)", () => {
    render(
      <CardCompletionToggle
        cardId="card-1"
        completedAt={new Date("2026-01-15T00:00:00Z")}
        canEdit
        variant="hero"
      />,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: "Reopen card (mark incomplete)",
    });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute("aria-checked", "true");
  });

  // ── Toggling via Server Action ────────────────────────────────────────────

  it("toggles from incomplete to complete via Server Action", async () => {
    actions.toggleCardCompletionAction.mockResolvedValue({ success: true });
    render(
      <CardCompletionToggle
        cardId="card-1"
        completedAt={null}
        canEdit
        variant="face"
      />,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Mark card complete" }),
    );

    await waitFor(
      () =>
        expect(actions.toggleCardCompletionAction).toHaveBeenCalledTimes(1),
    );
    const formData = actions.toggleCardCompletionAction.mock
      .calls[0][0] as FormData;
    expect(formData.get("cardId")).toBe("card-1");
    expect(formData.get("complete")).toBe("true");
  });

  it("toggles from complete to incomplete via Server Action", async () => {
    actions.toggleCardCompletionAction.mockResolvedValue({ success: true });
    render(
      <CardCompletionToggle
        cardId="card-2"
        completedAt={new Date("2026-01-15T00:00:00Z")}
        canEdit
        variant="hero"
      />,
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Reopen card (mark incomplete)",
      }),
    );

    await waitFor(
      () =>
        expect(actions.toggleCardCompletionAction).toHaveBeenCalledTimes(1),
    );
    const formData = actions.toggleCardCompletionAction.mock
      .calls[0][0] as FormData;
    expect(formData.get("cardId")).toBe("card-2");
    expect(formData.get("complete")).toBe("false");
  });

  // ── router.refresh on success ─────────────────────────────────────────────

  it("calls router.refresh after a successful toggle", async () => {
    actions.toggleCardCompletionAction.mockResolvedValue({ success: true });
    render(
      <CardCompletionToggle
        cardId="card-1"
        completedAt={null}
        canEdit
        variant="face"
      />,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Mark card complete" }),
    );

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("does not call router.refresh after a failed toggle", async () => {
    actions.toggleCardCompletionAction.mockResolvedValue({
      success: false,
      error: "Estimate required",
    });
    render(
      <CardCompletionToggle
        cardId="card-1"
        completedAt={null}
        canEdit
        variant="face"
      />,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Mark card complete" }),
    );

    await waitFor(
      () =>
        expect(actions.toggleCardCompletionAction).toHaveBeenCalledTimes(1),
    );
    // router.refresh should NOT be called when the action fails.
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  // ── onError callback ──────────────────────────────────────────────────────

  it("calls onError with error message on failure", async () => {
    actions.toggleCardCompletionAction.mockResolvedValue({
      success: false,
      error: "Estimate required",
    });
    const onError = vi.fn();
    render(
      <CardCompletionToggle
        cardId="card-5"
        completedAt={null}
        canEdit
        variant="face"
        onError={onError}
      />,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Mark card complete" }),
    );

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("Estimate required"),
    );
  });

  it("calls onError with empty string on success to clear prior errors", async () => {
    actions.toggleCardCompletionAction.mockResolvedValue({ success: true });
    const onError = vi.fn();
    render(
      <CardCompletionToggle
        cardId="card-6"
        completedAt={null}
        canEdit
        variant="face"
        onError={onError}
      />,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Mark card complete" }),
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith(""));
  });

  // ── canEdit=false: static indicator ───────────────────────────────────────

  it("renders a static not-completed indicator when canEdit is false", () => {
    render(
      <CardCompletionToggle
        cardId="card-3"
        completedAt={null}
        canEdit={false}
        variant="face"
      />,
    );
    // No checkbox role — it's a static img role
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const img = screen.getByRole("img", { name: "Not completed" });
    expect(img).toBeInTheDocument();
    // Should be a <span>, not a <button>
    expect(img.tagName).toBe("SPAN");
  });

  it("renders a static completed indicator when canEdit is false", () => {
    render(
      <CardCompletionToggle
        cardId="card-4"
        completedAt={new Date("2026-01-15T00:00:00Z")}
        canEdit={false}
        variant="face"
      />,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const img = screen.getByRole("img", { name: "Completed" });
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("SPAN");
  });
});
