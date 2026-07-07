import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";

import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";

import { ListCardItem } from "./list-card-item";

// ── Mock Server Actions ─────────────────────────────────────────────────────
// ListCardItem calls archiveCardAction; its CardCompletionToggle child calls
// toggleCardCompletionAction. Both live in the same actions module.
const actions = vi.hoisted(() => ({
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

// Radix/pointer checks that happy-dom doesn't model.
const user = userEvent.setup({ pointerEventsCheck: 0 });

const baseCard = {
  id: "card-1",
  title: "Ship the thing",
  listId: "list-1",
  coverImage: null,
  priority: null,
  dueDate: null,
  completedAt: null,
  labels: [],
  members: [],
  memberCount: 0,
  checklistDone: 0,
  checklistTotal: 0,
  commentCount: 0,
};

// Minimal DnD context: ListCardItem renders a <Draggable>, which must live
// inside a <Droppable> inside a <DragDropContext>. We only exercise render +
// click/keyboard here (not an actual drag), so a static context is enough.
function renderCard(
  props: Partial<React.ComponentProps<typeof ListCardItem>> = {},
) {
  const onOpenCard = vi.fn();
  render(
    <DragDropContext onDragEnd={() => {}}>
      <Droppable droppableId="list-1" type="card">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            <ListCardItem
              card={baseCard}
              index={0}
              canEdit
              canArchive
              canDrag
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

const cardName = "Open card Ship the thing";

describe("ListCardItem — whole-card drag/open (US-069)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
  });

  it("opens the card when its body is clicked", async () => {
    const { onOpenCard } = renderCard();
    await user.click(screen.getByRole("button", { name: cardName }));
    expect(onOpenCard).toHaveBeenCalledTimes(1);
    expect(onOpenCard).toHaveBeenCalledWith("card-1");
  });

  it("opens the card on Enter when the body is focused", async () => {
    const { onOpenCard } = renderCard();
    const card = screen.getByRole("button", { name: cardName });
    card.focus();
    await user.keyboard("{Enter}");
    expect(onOpenCard).toHaveBeenCalledTimes(1);
    expect(onOpenCard).toHaveBeenCalledWith("card-1");
  });

  it("does not render a drag-grip button (the body is the handle)", () => {
    renderCard();
    expect(
      screen.queryByRole("button", { name: "Drag card" }),
    ).not.toBeInTheDocument();
  });

  it("clicking the completion toggle does not open the card", async () => {
    const { onOpenCard } = renderCard();
    await user.click(
      screen.getByRole("checkbox", { name: "Mark card complete" }),
    );
    expect(onOpenCard).not.toHaveBeenCalled();
  });

  it("clicking the actions menu does not open the card", async () => {
    const { onOpenCard } = renderCard();
    await user.click(screen.getByRole("button", { name: "Card actions" }));
    expect(onOpenCard).not.toHaveBeenCalled();
  });

  it("lets a viewer (canDrag=false) still open the card", async () => {
    const { onOpenCard } = renderCard({
      canDrag: false,
      canEdit: false,
      canArchive: false,
    });
    await user.click(screen.getByRole("button", { name: cardName }));
    expect(onOpenCard).toHaveBeenCalledTimes(1);
    expect(onOpenCard).toHaveBeenCalledWith("card-1");
  });
});
