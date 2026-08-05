import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { useBoardStore } from "./board-store";
import { BoardStoreProvider } from "./board-store-provider";
import type { Watcher } from "@/lib/realtime/types";

const mockRefresh = vi.hoisted(() => vi.fn());
const mockReplace = vi.hoisted(() => vi.fn());
const mockJoinBoard = vi.hoisted(() => vi.fn());
const mockLeaveBoard = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: mockReplace }),
  usePathname: () => "/boards/b-1",
  useSearchParams: () => new URLSearchParams(),
}));

const listeners = new Map<string, (payload: unknown) => void>();
const mockSocket = {
  connected: true,
  on: vi.fn((event: string, fn: (payload: unknown) => void) => {
    listeners.set(event, fn);
  }),
  off: vi.fn((event: string) => {
    listeners.delete(event);
  }),
  emit: vi.fn(),
};

vi.mock("@/lib/realtime/client", () => ({
  initSocket: () => mockSocket,
  joinBoard: mockJoinBoard,
  leaveBoard: mockLeaveBoard,
}));

const currentViewer: Watcher = {
  id: "u-1",
  name: "Test User",
  image: null,
  role: "editor",
};

describe("BoardStoreProvider — list:restored realtime event handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    useBoardStore.getState().reset();
  });

  it("subscribes to list:restored on mount and cleans up on unmount", () => {
    const { unmount } = render(
      <BoardStoreProvider
        boardId="b-1"
        lists={[]}
        selectedCardId={null}
        selectedCard={null}
        currentViewer={currentViewer}
        canEdit={true}
        canDelete={true}
        canCreateList={true}
        canCreateCard={true}
        canEditCard={true}
        canArchiveCard={true}
      >
        <div>Board</div>
      </BoardStoreProvider>,
    );

    expect(mockSocket.on).toHaveBeenCalledWith("list:restored", expect.any(Function));
    expect(listeners.has("list:restored")).toBe(true);

    unmount();
    expect(mockSocket.off).toHaveBeenCalledWith("list:restored", expect.any(Function));
  });

  it("inserts restored list snapshot into store and calls router.refresh() when not dragging", () => {
    render(
      <BoardStoreProvider
        boardId="b-1"
        lists={[
          {
            id: "l-1",
            title: "List 1",
            boardId: "b-1",
            position: 10000,
            cards: [],
          },
        ]}
        selectedCardId={null}
        selectedCard={null}
        currentViewer={currentViewer}
        canEdit={true}
        canDelete={true}
        canCreateList={true}
        canCreateCard={true}
        canEditCard={true}
        canArchiveCard={true}
      >
        <div>Board</div>
      </BoardStoreProvider>,
    );

    const handleListRestored = listeners.get("list:restored");
    expect(handleListRestored).toBeDefined();

    handleListRestored!({
      boardId: "b-1",
      list: {
        id: "l-restored",
        title: "Restored List",
        boardId: "b-1",
        position: 20000,
      },
    });

    const lists = useBoardStore.getState().lists;
    expect(lists.map((l) => l.id)).toEqual(["l-1", "l-restored"]);
    expect(lists.find((l) => l.id === "l-restored")?.cards).toEqual([]);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("defers list:restored application and marks resync pending when a local drag is active", () => {
    render(
      <BoardStoreProvider
        boardId="b-1"
        lists={[
          {
            id: "l-1",
            title: "List 1",
            boardId: "b-1",
            position: 10000,
            cards: [],
          },
        ]}
        selectedCardId={null}
        selectedCard={null}
        currentViewer={currentViewer}
        canEdit={true}
        canDelete={true}
        canCreateList={true}
        canCreateCard={true}
        canEditCard={true}
        canArchiveCard={true}
      >
        <div>Board</div>
      </BoardStoreProvider>,
    );

    useBoardStore.getState().setDragging(true);

    const handleListRestored = listeners.get("list:restored");
    handleListRestored!({
      boardId: "b-1",
      list: {
        id: "l-restored",
        title: "Restored List",
        boardId: "b-1",
        position: 20000,
      },
    });

    // List is deferred, not immediately added to store while dragging
    const lists = useBoardStore.getState().lists;
    expect(lists.map((l) => l.id)).toEqual(["l-1"]);
    expect(useBoardStore.getState().pendingResync).toBe(true);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("BoardStoreProvider — board:archived / board:deleted (F10) + board:error (U5)", () => {
  function renderProvider() {
    return render(
      <BoardStoreProvider
        boardId="b-1"
        lists={[]}
        selectedCardId={null}
        selectedCard={null}
        currentViewer={currentViewer}
        canEdit={true}
        canDelete={true}
        canCreateList={true}
        canCreateCard={true}
        canEditCard={true}
        canArchiveCard={true}
      >
        <div>Board</div>
      </BoardStoreProvider>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    useBoardStore.getState().reset();
  });

  it("subscribes to board:archived, board:deleted and board:error on mount", () => {
    renderProvider();

    expect(listeners.has("board:archived")).toBe(true);
    expect(listeners.has("board:deleted")).toBe(true);
    expect(listeners.has("board:error")).toBe(true);
  });

  it("board:archived for the current board leaves the room, resets the store and refreshes", () => {
    renderProvider();
    // The provider seeded the store with the current board on mount.
    expect(useBoardStore.getState().boardId).toBe("b-1");

    listeners.get("board:archived")!({ boardId: "b-1", archivedAt: "2026-08-05T00:00:00.000Z" });

    expect(mockLeaveBoard).toHaveBeenCalledWith("b-1");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(useBoardStore.getState().boardId).toBeNull();
  });

  it("board:archived for a different board is ignored (no leave, no refresh)", () => {
    renderProvider();

    listeners.get("board:archived")!({ boardId: "b-other", archivedAt: "2026-08-05T00:00:00.000Z" });

    expect(mockLeaveBoard).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(useBoardStore.getState().boardId).toBe("b-1");
  });

  it("board:deleted for the current board leaves the room, resets the store and replaces to /boards", () => {
    renderProvider();

    listeners.get("board:deleted")!({ boardId: "b-1" });

    expect(mockLeaveBoard).toHaveBeenCalledWith("b-1");
    expect(mockReplace).toHaveBeenCalledWith("/boards");
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(useBoardStore.getState().boardId).toBeNull();
  });

  it("board:error triggers a router.refresh so server state re-renders (U5)", () => {
    renderProvider();

    listeners.get("board:error")!({ message: "Not authorized to join this board" });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
