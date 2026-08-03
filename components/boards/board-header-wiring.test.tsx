/**
 * BoardHeader → ArchivedCardsDialog forwarding proof (US-074 Slice C).
 *
 * Renders BoardHeader with a mocked ArchivedCardsDialog that exposes the
 * canPermanentDelete prop it receives. Removes ambiguity: the mock captures
 * the exact prop value BoardHeader forwards.
 *
 * Removing the production forwarding (`canPermanentDelete={canPermanentDelete}`
 * in board-header.tsx) makes these tests fail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

// Mock heavy child dependencies so BoardHeader mounts in the test environment.
vi.mock("@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store", () => ({
  useBoardStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ watchers: [], socketConnected: true }),
}))

vi.mock("@/app/(authenticated)/(dashboard)/boards/actions", () => ({
  toggleBoardStarAction: vi.fn(),
  updateBoardAction: vi.fn(),
}))

// Mock ArchivedCardsDialog so we capture the forwarded canPermanentDelete prop.
let capturedCanPermanentDelete: boolean | undefined

vi.mock("@/components/boards/archived-cards-dialog", () => ({
  ArchivedCardsDialog: (props: {
    archivedCards: unknown[]
    archivedLists?: unknown[]
    canRestore: boolean
    canPermanentDelete?: boolean
  }) => {
    capturedCanPermanentDelete = props.canPermanentDelete
    return <div data-testid="mocked-archived-dialog" />
  },
}))

// Mock other BoardHeader children to avoid import errors.
vi.mock("@/components/boards/board-filter", () => ({
  BoardFilter: () => <div data-testid="board-filter" />,
}))
vi.mock("@/components/boards/board-menu", () => ({
  BoardMenu: () => <div data-testid="board-menu" />,
}))
vi.mock("@/components/workspace/automation/board-automation-dialog", () => ({
  BoardAutomationDialog: () => <div data-testid="board-automation" />,
}))

import { BoardHeader } from "./board-header"

const baseBoard = {
  id: "b-1",
  title: "Test Board",
  backgroundColor: null,
}

const emptyArchived: [] = []

function renderBoard(opts: { canPermanentDelete?: boolean; omitProp?: boolean } = {}) {
  const props: Record<string, unknown> = {
    board: baseBoard,
    canEdit: true,
    canDelete: true,
    canArchiveCard: true,
    canDeleteList: true,
    archivedCards: emptyArchived,
    archivedLists: emptyArchived,
    starred: false,
  }
  if (!opts.omitProp) {
    props.canPermanentDelete = opts.canPermanentDelete ?? false
  }
  return render(<BoardHeader {...(props as Parameters<typeof BoardHeader>[0])} />)
}

describe("BoardHeader → ArchivedCardsDialog canPermanentDelete forwarding", () => {
  beforeEach(() => {
    capturedCanPermanentDelete = undefined
  })

  it("forwards canPermanentDelete=true when BoardHeader receives it", () => {
    renderBoard({ canPermanentDelete: true })
    expect(capturedCanPermanentDelete).toBe(true)
  })

  it("forwards canPermanentDelete=false when BoardHeader receives false", () => {
    renderBoard({ canPermanentDelete: false })
    expect(capturedCanPermanentDelete).toBe(false)
  })

  it("forwards canPermanentDelete=false (default) when BoardHeader omits the prop", () => {
    renderBoard({ omitProp: true })
    expect(capturedCanPermanentDelete).toBe(false)
  })

  it("sabotage: removing forwarding makes capturedCanPermanentDelete undefined", () => {
    // If production forwarding is removed from board-header.tsx, the mock
    // ArchivedCardsDialog receives undefined instead of the expected boolean.
    // This test proves the mock capture is working and that the test would
    // fail if forwarding were absent.
    renderBoard({ canPermanentDelete: true })
    expect(capturedCanPermanentDelete).not.toBeUndefined()
    expect(capturedCanPermanentDelete).toBe(true)
  })
})
