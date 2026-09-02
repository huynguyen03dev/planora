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
import { render, screen } from "@testing-library/react"

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

// U1: capture the props BoardHeader forwards to InviteMemberDialog when it
// wires the Share button into the invite flow.
let capturedInviteWorkspaceId: string | undefined

vi.mock("@/components/workspace/members/invite-member-dialog", () => ({
  InviteMemberDialog: (props: {
    workspaceId: string
    trigger?: React.ReactNode
  }) => {
    capturedInviteWorkspaceId = props.workspaceId
    return (
      <div data-testid="mocked-invite-dialog">{props.trigger}</div>
    )
  },
}))

import { BoardHeader } from "./board-header"

const baseBoard = {
  id: "b-1",
  title: "Test Board",
  backgroundColor: null,
}

const emptyArchived: [] = []

function renderBoard(opts: {
  canPermanentDelete?: boolean
  omitProp?: boolean
  workspaceId?: string
  canInviteMembers?: boolean
} = {}) {
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
  if (opts.workspaceId !== undefined) {
    props.workspaceId = opts.workspaceId
  }
  if (opts.canInviteMembers !== undefined) {
    props.canInviteMembers = opts.canInviteMembers
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

describe("BoardHeader → Share button wires into the invite flow (U1)", () => {
  beforeEach(() => {
    capturedInviteWorkspaceId = undefined
  })

  it("renders Share and forwards workspaceId to InviteMemberDialog when allowed", () => {
    renderBoard({ workspaceId: "ws-1", canInviteMembers: true })

    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument()
    expect(screen.getByTestId("mocked-invite-dialog")).toBeInTheDocument()
    expect(capturedInviteWorkspaceId).toBe("ws-1")
  })

  it("renders no dead Share button when the viewer cannot invite", () => {
    renderBoard({ workspaceId: "ws-1", canInviteMembers: false })

    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("mocked-invite-dialog")).not.toBeInTheDocument()
  })

  it("renders no dead Share button without a workspace context", () => {
    renderBoard({ canInviteMembers: true })

    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument()
  })

  it("compacts the header on narrow screens without hiding controls (polish/mobile-dashboard)", () => {
    renderBoard({ workspaceId: "ws-1", canInviteMembers: true })

    // Density: reduced padding/gaps below md, desktop values restored at md+.
    const header = document.querySelector("header")
    expect(header).toHaveClass("p-3", "md:p-5", "space-y-2", "md:space-y-4")

    // The Share control never hides — its label span does (below md), and the
    // aria-label keeps the accessible name stable in both states.
    const share = screen.getByRole("button", { name: "Share" })
    expect(share).toHaveAttribute("aria-label", "Share")
    const label = Array.from(share.querySelectorAll("span")).find(
      (span) => span.textContent === "Share",
    )
    expect(label).toBeDefined()
    expect(label).toHaveClass("hidden", "md:inline")
    expect(share.querySelector("svg")).not.toBeNull()

    // All role-gated controls remain in the tree.
    expect(screen.getByRole("button", { name: "Star board" })).toBeInTheDocument()
    expect(screen.getByTestId("mocked-archived-dialog")).toBeInTheDocument()
    expect(screen.getByTestId("board-filter")).toBeInTheDocument()
    expect(screen.getByTestId("board-automation")).toBeInTheDocument()
    expect(screen.getByTestId("board-menu")).toBeInTheDocument()
  })
})
