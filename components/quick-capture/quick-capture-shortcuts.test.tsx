/**
 * US-083 W7 — Quick Capture global shortcut guards (RTL).
 *
 * The locked shortcut contract: bare `C` and `Cmd/Ctrl+K` open the dialog
 * from any authenticated page, but ONLY when the shortcut is actually
 * handled — never while typing in an input/textarea/select/contenteditable,
 * never on copy (modified C), never on Shift+C, never while another
 * dialog/menu/listbox is open, never on key repeat or IME composition, and
 * never when the dialog is already open. `preventDefault` is called exactly
 * when (and only when) the shortcut is handled (Cmd/Ctrl+K must also stop
 * the browser's own binding).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { QuickCaptureOptions } from "@/lib/quick-capture";

const h = vi.hoisted(() => ({
  pathname: "/today",
  optionsAction: vi.fn(),
  createCard: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => h.pathname }));
vi.mock("@/app/(authenticated)/actions", () => ({
  getQuickCaptureOptionsAction: h.optionsAction,
}));
vi.mock("@/app/(authenticated)/(dashboard)/boards/[boardId]/actions", () => ({
  createCardAction: h.createCard,
}));

import { QuickCapture } from "./quick-capture";

const emptyOptions: QuickCaptureOptions = { workspaces: [] };

const user = userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  h.optionsAction.mockResolvedValue(emptyOptions);
});

/** Dispatches a real cancelable KeyboardEvent on `target` (bubbles to the
 *  window listener) and returns it so the test can spy preventDefault. */
function dispatchKey(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  const preventDefault = vi.spyOn(event, "preventDefault");
  target.dispatchEvent(event);
  return { event, preventDefault };
}

function dialog() {
  return screen.queryByRole("dialog", { name: "Quick capture" });
}

describe("QuickCapture global shortcuts — handled cases", () => {
  it("bare C opens the dialog and prevents default exactly once", async () => {
    render(<QuickCapture />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Quick capture" })).toHaveAttribute(
        "data-shortcuts-ready",
        "true",
      ),
    );

    const { preventDefault } = dispatchKey(window, { key: "c" });

    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+K opens the dialog and prevents default exactly once", async () => {
    render(<QuickCapture />);
    const { preventDefault } = dispatchKey(window, { key: "k", ctrlKey: true });
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("Cmd+K opens the dialog and prevents default exactly once", async () => {
    render(<QuickCapture />);
    const { preventDefault } = dispatchKey(window, { key: "k", metaKey: true });
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe("QuickCapture global shortcuts — guards (never handled ⇒ no preventDefault)", () => {
  it("C while typing in an input types instead of opening", async () => {
    render(
      <div>
        <QuickCapture />
        <input aria-label="search" />
      </div>,
    );
    const input = screen.getByRole("textbox", { name: "search" });

    const { preventDefault } = dispatchKey(input, { key: "c" });

    expect(dialog()).not.toBeInTheDocument();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("C while typing in a textarea / select / contenteditable is guarded", async () => {
    render(
      <div>
        <QuickCapture />
        <textarea aria-label="notes" />
        <select aria-label="picker" />
        <div contentEditable aria-label="editor" />
      </div>,
    );

    const textarea = screen.getByRole("textbox", { name: "notes" });
    const { preventDefault: textareaPreventDefault } = dispatchKey(textarea, { key: "c" });
    expect(dialog()).not.toBeInTheDocument();
    expect(textareaPreventDefault).not.toHaveBeenCalled();

    const select = screen.getByRole("combobox", { name: "picker" });
    const { preventDefault: selectPreventDefault } = dispatchKey(select, { key: "c" });
    expect(dialog()).not.toBeInTheDocument();
    expect(selectPreventDefault).not.toHaveBeenCalled();

    // happy-dom does not map contenteditable to role textbox — query by label.
    const editor = screen.getByLabelText("editor");
    const { preventDefault: editorPreventDefault } = dispatchKey(editor, { key: "c" });
    expect(dialog()).not.toBeInTheDocument();
    expect(editorPreventDefault).not.toHaveBeenCalled();
  });

  it("copy (Ctrl+C / Cmd+C) never opens and never prevents default", async () => {
    render(<QuickCapture />);

    const { preventDefault: ctrl } = dispatchKey(window, { key: "c", ctrlKey: true });
    expect(dialog()).not.toBeInTheDocument();
    expect(ctrl).not.toHaveBeenCalled();

    const { preventDefault: meta } = dispatchKey(window, { key: "c", metaKey: true });
    expect(dialog()).not.toBeInTheDocument();
    expect(meta).not.toHaveBeenCalled();
  });

  it("Shift+C (capital C) never opens and never prevents default", async () => {
    render(<QuickCapture />);
    const { preventDefault } = dispatchKey(window, { key: "C", shiftKey: true });
    expect(dialog()).not.toBeInTheDocument();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("key repeat never re-triggers and never prevents default", async () => {
    render(<QuickCapture />);
    const { preventDefault } = dispatchKey(window, { key: "c", repeat: true });
    expect(dialog()).not.toBeInTheDocument();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("IME composition is ignored and never prevents default", async () => {
    render(<QuickCapture />);
    const { preventDefault } = dispatchKey(window, { key: "c", isComposing: true });
    expect(dialog()).not.toBeInTheDocument();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("does not re-fire while the dialog is already open", async () => {
    render(<QuickCapture />);
    dispatchKey(window, { key: "c" });
    await waitFor(() => expect(dialog()).toBeInTheDocument());

    const { preventDefault } = dispatchKey(window, { key: "c" });

    expect(dialog()).toBeInTheDocument();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("is suppressed while another dialog/menu is open in the document", async () => {
    render(
      <div>
        <QuickCapture />
        <div role="dialog" data-state="open" aria-label="other dialog" />
      </div>,
    );

    const { preventDefault } = dispatchKey(window, { key: "c" });

    expect(dialog()).not.toBeInTheDocument();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("is suppressed while a radix select listbox is open", async () => {
    render(
      <div>
        <QuickCapture />
        <div role="listbox" data-state="open" />
      </div>,
    );

    const { preventDefault } = dispatchKey(window, { key: "c" });

    expect(dialog()).not.toBeInTheDocument();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("opening via the chrome button still works after the guards", async () => {
    render(<QuickCapture />);
    await user.click(screen.getByRole("button", { name: "Quick capture" }));
    expect(dialog()).toBeInTheDocument();
  });
});
