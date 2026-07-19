import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Server Action + router mocks ──
const actions = vi.hoisted(() => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
  acceptInvitationAction: vi.fn(),
  declineInvitationAction: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: actions.routerPush }),
}));

vi.mock("@/lib/notification-actions", () => ({
  markNotificationReadAction: actions.markNotificationReadAction,
  markAllNotificationsReadAction: actions.markAllNotificationsReadAction,
}));

vi.mock("@/lib/invitation-actions", () => ({
  acceptInvitationAction: actions.acceptInvitationAction,
  declineInvitationAction: actions.declineInvitationAction,
}));

import { NotificationDropdown } from "./notification-dropdown";
import type {
  InboxNotificationItem,
  InboxInvitationItem,
} from "@/lib/notifications/inbox";

// ── Test helpers ──
const user = userEvent.setup({ pointerEventsCheck: 0 });

function makeNotification(
  overrides: Partial<InboxNotificationItem> = {},
): InboxNotificationItem {
  return {
    id: "n-1",
    type: "card-assigned",
    title: "You were assigned to a card",
    message: "Alice assigned you to 'Fix login bug'",
    linkUrl: null,
    isRead: false,
    createdAt: new Date().toISOString(), // → "Just now" via formatRelativeTime
    ...overrides,
  };
}

function makeInvitation(
  overrides: Partial<InboxInvitationItem> = {},
): InboxInvitationItem {
  return {
    id: "inv-1",
    workspaceId: "ws-1",
    workspaceName: "Acme Corp",
    role: "editor",
    inviterName: "Bob",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockFetch(
  notifications: InboxNotificationItem[] = [],
  invitations: InboxInvitationItem[] = [],
) {
  vi.spyOn(global, "fetch").mockImplementation((url) => {
    const s = typeof url === "string" ? url : String(url);
    if (s.includes("/api/notifications")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ notifications }),
      } as Response);
    }
    if (s.includes("/api/invitations")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ invitations }),
      } as Response);
    }
    return Promise.reject(new Error(`Unexpected fetch: ${s}`));
  });
}

function renderDropdown(
  props: Partial<Parameters<typeof NotificationDropdown>[0]> = {},
) {
  return render(
    <NotificationDropdown
      isOpen
      onClose={vi.fn()}
      onMarkOneRead={vi.fn()}
      onMarkAllRead={vi.fn()}
      onInvitationCountChange={vi.fn()}
      {...props}
    />,
  );
}

// ── Tests ──
describe("NotificationDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <NotificationDropdown
        isOpen={false}
        onClose={vi.fn()}
        onMarkOneRead={vi.fn()}
        onMarkAllRead={vi.fn()}
        onInvitationCountChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a loading indicator while fetching", () => {
    mockFetch();
    renderDropdown();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders notification items from the API", async () => {
    const n1 = makeNotification({
      id: "n-1",
      title: "Card assigned",
      message: "You got a new task",
    });
    mockFetch([n1]);
    renderDropdown();

    await waitFor(() => {
      expect(screen.getByText(/Card assigned/)).toBeInTheDocument();
    });
    expect(screen.getByText(/You got a new task/)).toBeInTheDocument();
  });

  it("shows empty state when the inbox is empty", async () => {
    mockFetch([], []);
    renderDropdown();

    await waitFor(() => {
      expect(screen.getByText("No notifications yet")).toBeInTheDocument();
    });
  });

  it("calls markNotificationReadAction and onMarkOneRead when clicking an unread notification", async () => {
    actions.markNotificationReadAction.mockResolvedValue({ success: true });
    const n1 = makeNotification({
      id: "n-read-me",
      isRead: false,
      title: "Fresh notif",
    });
    mockFetch([n1]);
    const onMarkOneRead = vi.fn();
    const onClose = vi.fn();
    renderDropdown({ onMarkOneRead, onClose });

    await waitFor(() => {
      expect(screen.getByText(/Fresh notif/)).toBeInTheDocument();
    });

    // Click on the notification button's text content.
    await user.click(screen.getByText(/Fresh notif/));

    await waitFor(() => {
      expect(actions.markNotificationReadAction).toHaveBeenCalledWith(
        "n-read-me",
      );
    });
    expect(vi.mocked(onMarkOneRead)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(onClose)).toHaveBeenCalledTimes(1);
  });

  it("does not call markNotificationReadAction for an already-read notification", async () => {
    const n1 = makeNotification({ id: "n-old", isRead: true, title: "Old notif" });
    mockFetch([n1]);
    const onClose = vi.fn();
    renderDropdown({ onClose });

    await waitFor(() => {
      expect(screen.getByText(/Old notif/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Old notif/));

    expect(actions.markNotificationReadAction).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls markAllNotificationsReadAction and onMarkAllRead when clicking Mark all read", async () => {
    actions.markAllNotificationsReadAction.mockResolvedValue({ success: true });
    const n1 = makeNotification({ isRead: false });
    mockFetch([n1]);
    const onMarkAllRead = vi.fn();
    renderDropdown({ onMarkAllRead });

    await waitFor(() => {
      expect(screen.getByText("Mark all read")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Mark all read"));

    await waitFor(() => {
      expect(actions.markAllNotificationsReadAction).toHaveBeenCalled();
    });
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it("hides Mark all read button when every notification is already read", async () => {
    const n1 = makeNotification({ isRead: true, title: "Read notif" });
    mockFetch([n1]);
    renderDropdown();

    await waitFor(() => {
      expect(screen.getByText(/Read notif/)).toBeInTheDocument();
    });
    expect(screen.queryByText("Mark all read")).not.toBeInTheDocument();
  });

  it("renders invitation items with Accept and Decline buttons", async () => {
    const inv = makeInvitation();
    mockFetch([], [inv]);
    renderDropdown();

    await waitFor(() => {
      expect(
        screen.getByText(/Invitation to Acme Corp/),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Bob invited you as editor/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("calls onInvitationCountChange with the pending invitation count after fetch", async () => {
    const inv1 = makeInvitation({ id: "inv-1" });
    const inv2 = makeInvitation({ id: "inv-2" });
    mockFetch([], [inv1, inv2]);
    const onInvitationCountChange = vi.fn();
    renderDropdown({ onInvitationCountChange });

    await waitFor(() => {
      expect(onInvitationCountChange).toHaveBeenCalledWith(2);
    });
  });

  it("shows error state when fetch fails (network error)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
    renderDropdown();

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load notifications/),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Retry/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
  });

  it("shows error state (not empty) when notifications API returns non-OK on first load", async () => {
    // fetch() does not throw on 500 — it resolves with ok: false.
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      const s = typeof url === "string" ? url : String(url);
      if (s.includes("/api/notifications")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as Response);
      }
      if (s.includes("/api/invitations")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ invitations: [] }),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch: ${s}`));
    });
    renderDropdown();

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load notifications/),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /Retry/i }),
    ).toBeInTheDocument();
    // Must NOT show the empty state — we don't know if there are notifications.
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
  });

  it("shows error when mark all read fails", async () => {
    actions.markAllNotificationsReadAction.mockResolvedValue({
      success: false,
      error: "Something went wrong",
    });
    const n1 = makeNotification({ isRead: false });
    mockFetch([n1]);
    const onMarkAllRead = vi.fn();
    renderDropdown({ onMarkAllRead });

    await waitFor(() => {
      expect(screen.getByText("Mark all read")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Mark all read"));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    // The button should still be visible (unread count unchanged).
    expect(screen.getByText("Mark all read")).toBeInTheDocument();

    // Callback should not fire on failure.
    expect(onMarkAllRead).not.toHaveBeenCalled();
  });

  it("renders the View all notifications link", async () => {
    mockFetch([], []);
    renderDropdown();

    await waitFor(() => {
      expect(
        screen.getByText("View all notifications"),
      ).toBeInTheDocument();
    });
  });
});
