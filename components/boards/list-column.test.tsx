import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";

import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

import { ListColumn } from "./list-column";
import { UndoHost } from "@/components/undo/undo-snackbar";

// ListColumn + its card children reach these Server Actions; stub them all.
const actions = vi.hoisted(() => ({
  createCardAction: vi.fn(async (): Promise<
    | { success: true; cardId: string }
    | { success: false; error: string }
  > => ({ success: true, cardId: "card-1" })),
  updateListAction: vi.fn(async () => ({ success: true })),
  deleteListAction: vi.fn(async () => ({ success: true })),
  archiveCardAction: vi.fn(async () => ({ success: true })),
  toggleCardCompletionAction: vi.fn(async () => ({ success: true })),
  restoreListAction: vi.fn(async (fd: FormData) => {
    void fd;
    return { success: true };
  }),
}));
vi.mock(
  "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions",
  () => actions,
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/boards/board-1",
  useSearchParams: () => new URLSearchParams(),
}));

const user = userEvent.setup({ pointerEventsCheck: 0 });

const baseList = {
  id: "list-1",
  title: "Backlog",
  boardId: "board-1",
  cards: [],
};

// A list <Draggable> must live inside a horizontal, type="list" <Droppable>.
function renderList(
  props: Partial<React.ComponentProps<typeof ListColumn>> = {},
) {
  const onOpenCard = vi.fn();
  render(
    <UndoHost>
      <DragDropContext onDragEnd={() => {}}>
        <Droppable droppableId="board" type="list" direction="horizontal">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              <ListColumn
                list={baseList}
                index={0}
                canEdit
                canDelete
                canCreateCard
                canEditCard
                canArchiveCard
                canSortList
                canSortCards
                onOpenCard={onOpenCard}
                {...props}
              />
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </UndoHost>,
  );
  return { onOpenCard };
}

describe("ListColumn — whole-header drag (US-069)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
  });

  it("does not render a drag-grip button (the header is the handle)", () => {
    renderList();
    expect(
      screen.queryByRole("button", { name: "Drag list" }),
    ).not.toBeInTheDocument();
  });

  it("still enters inline rename when the title is clicked", async () => {
    renderList();
    await user.click(screen.getByRole("button", { name: "Backlog" }));
    // The title button is swapped for an autofocused input seeded with the title.
    expect(screen.getByRole("textbox")).toHaveValue("Backlog");
  });

  it("keeps the list title readable when the viewer cannot sort", () => {
    // canSortList=false → header is not a drag handle, but the list still renders.
    renderList({ canSortList: false });
    expect(screen.getByRole("button", { name: "Backlog" })).toBeInTheDocument();
  });
});

describe("ListColumn — add-card composer dismissal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
  });

  it("closes the add-card composer when a pointer-down lands outside it", async () => {
    renderList();
    await user.click(screen.getByRole("button", { name: "+ Add a card" }));
    expect(
      screen.getByPlaceholderText("Enter card title..."),
    ).toBeInTheDocument();

    // Click outside the composer form → it collapses back to the button.
    await user.click(document.body);

    expect(
      screen.queryByPlaceholderText("Enter card title..."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Add a card" }),
    ).toBeInTheDocument();
  });

  it("keeps the composer open when the pointer-down lands inside it", async () => {
    renderList();
    await user.click(screen.getByRole("button", { name: "+ Add a card" }));
    await user.click(screen.getByPlaceholderText("Enter card title..."));
    expect(
      screen.getByPlaceholderText("Enter card title..."),
    ).toBeInTheDocument();
  });
});

describe("ListColumn — safe list archive (US-074 Slice A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
  });

  it("opens archive confirmation dialog and calls deleteListAction on confirm", async () => {
    renderList();
    await user.click(screen.getByRole("button", { name: "List actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive list" }));

    expect(screen.getByText("Archive list?")).toBeInTheDocument();
    expect(
      screen.getByText(/This will archive the list "Backlog" and hide it from the active board/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive list" }));
    expect(actions.deleteListAction).toHaveBeenCalledTimes(1);
  });

  it("archive success offers undo with the call-site list id; Undo calls restoreListAction (W8 seam)", async () => {
    renderList();
    await user.click(screen.getByRole("button", { name: "List actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Archive list" }));
    await user.click(screen.getByRole("button", { name: "Archive list" }));

    // deleteListAction is the legacy soft-archive alias; eligibility follows
    // this intended archive UI call site (decision 0031).
    expect(actions.deleteListAction).toHaveBeenCalledTimes(1);
    const snackbar = await screen.findByRole("status");
    expect(snackbar).toHaveTextContent("List archived");

    await user.click(screen.getByRole("button", { name: /^Undo archive of/ }));
    expect(actions.restoreListAction).toHaveBeenCalledTimes(1);
    const fd = actions.restoreListAction.mock.calls[0][0] as FormData;
    expect(fd.get("listId")).toBe("list-1");
  });
});

describe("ListColumn — accessible field naming and scoped add-card errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
  });

  it("names the inline list-rename field 'List title'", async () => {
    renderList();
    await user.click(screen.getByRole("button", { name: "Backlog" }));
    expect(
      screen.getByRole("textbox", { name: "List title" }),
    ).toHaveValue("Backlog");
  });

  it("names the add-card composer field 'Card title'", async () => {
    renderList();
    await user.click(screen.getByRole("button", { name: "+ Add a card" }));
    expect(
      screen.getByRole("textbox", { name: "Card title" }),
    ).toBeInTheDocument();
  });

  it("announces an add-card validation error via role=alert wired to the field", async () => {
    renderList();
    await user.click(screen.getByRole("button", { name: "+ Add a card" }));
    const input = screen.getByRole("textbox", { name: "Card title" });

    // Whitespace-only title fails the client guard (submit is disabled for an
    // empty value, so drive the form's onSubmit directly).
    await user.type(input, "   ");
    fireEvent.submit(input.closest("form")!);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Title is required");
    expect(alert).toHaveAttribute("id", "add-card-error-list-1");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "add-card-error-list-1");
    expect(actions.createCardAction).not.toHaveBeenCalled();
  });

  it("announces an add-card server error via role=alert and keeps the composer open", async () => {
    actions.createCardAction.mockResolvedValueOnce({
      success: false,
      error: "Board is archived",
    });

    renderList();
    await user.click(screen.getByRole("button", { name: "+ Add a card" }));
    const input = screen.getByRole("textbox", { name: "Card title" });
    await user.type(input, "New card");
    await user.click(screen.getByRole("button", { name: "Add card" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Board is archived");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "add-card-error-list-1");
    // Composer stays open so the user can retry.
    expect(
      screen.getByRole("textbox", { name: "Card title" }),
    ).toHaveValue("New card");
  });
});
