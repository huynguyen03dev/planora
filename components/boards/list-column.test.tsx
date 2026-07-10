import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";

import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

import { ListColumn } from "./list-column";

// ListColumn + its card children reach these Server Actions; stub them all.
const actions = vi.hoisted(() => ({
  createCardAction: vi.fn(async () => ({ success: true })),
  updateListAction: vi.fn(async () => ({ success: true })),
  deleteListAction: vi.fn(async () => ({ success: true })),
  archiveCardAction: vi.fn(async () => ({ success: true })),
  toggleCardCompletionAction: vi.fn(async () => ({ success: true })),
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
    </DragDropContext>,
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
