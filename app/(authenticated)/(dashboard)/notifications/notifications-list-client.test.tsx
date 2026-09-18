import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Server Action + router mocks ──
const actions = vi.hoisted(() => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/notification-actions", () => ({
  markNotificationReadAction: actions.markNotificationReadAction,
  markAllNotificationsReadAction: actions.markAllNotificationsReadAction,
}));

import { NotificationsListClient } from "./notifications-list-client";

const user = userEvent.setup({ pointerEventsCheck: 0 });

function makeNotifications(count: number, start = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `n-${start + i}`,
    type: "ASSIGNED",
    title: `Notification ${start + i}`,
    message: "A message",
    linkUrl: null,
    isRead: false,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    readAt: null,
  }));
}

function mockFetch(batch: unknown[]) {
  vi.spyOn(global, "fetch").mockImplementation(async (url) => {
    const s = typeof url === "string" ? url : String(url);
    if (!s.includes("/api/notifications")) {
      throw new Error(`Unexpected fetch: ${s}`);
    }
    return {
      ok: true,
      json: async () => ({ notifications: batch }),
    } as Response;
  });
}

describe("NotificationsListClient — inbox cursor pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the initial notifications", () => {
    render(<NotificationsListClient notifications={makeNotifications(2)} hasMore={false} />);

    expect(screen.getByText("Notification 0")).toBeInTheDocument();
    expect(screen.getByText("Notification 1")).toBeInTheDocument();
  });

  it("shows Load more when hasMore is true (first page was full)", () => {
    render(<NotificationsListClient notifications={makeNotifications(50)} hasMore />);

    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("hides Load more when hasMore is false", () => {
    render(<NotificationsListClient notifications={makeNotifications(3)} hasMore={false} />);

    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("loads the next page with a cursor (last loaded id) and appends it", async () => {
    mockFetch(
      makeNotifications(50, 50).map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    );
    render(<NotificationsListClient notifications={makeNotifications(50)} hasMore />);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/notifications?cursor=n-49&limit=50",
      ),
    );
    expect(await screen.findByText("Notification 99")).toBeInTheDocument();
    expect(screen.getByText("Notification 49")).toBeInTheDocument();
    // A full batch may hide more rows → the button stays.
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("hides Load more when the fetched batch is short (end of feed)", async () => {
    mockFetch([
      {
        id: "n-50",
        type: "ASSIGNED",
        title: "Last notification",
        message: "m",
        linkUrl: null,
        isRead: false,
        createdAt: "2026-07-01T00:00:00.000Z",
        readAt: null,
      },
    ]);
    render(<NotificationsListClient notifications={makeNotifications(50)} hasMore />);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Last notification")).toBeInTheDocument();
  });

  it("drops a row whose id is already listed (id dedupe on append)", async () => {
    mockFetch([
      {
        id: "n-0",
        type: "ASSIGNED",
        title: "Duplicate",
        message: "m",
        linkUrl: null,
        isRead: false,
        createdAt: "2026-07-01T00:00:00.000Z",
        readAt: null,
      },
    ]);
    render(<NotificationsListClient notifications={makeNotifications(1)} hasMore />);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() =>
      expect(screen.queryByText("Duplicate")).not.toBeInTheDocument(),
    );
    // The original row is untouched.
    expect(screen.getByText("Notification 0")).toBeInTheDocument();
  });

  it("marks a notification read on click (existing behavior preserved)", async () => {
    actions.markNotificationReadAction.mockResolvedValue({ success: true });
    render(<NotificationsListClient notifications={makeNotifications(1)} hasMore={false} />);

    await user.click(screen.getByRole("button", { name: /Notification 0/ }));

    await waitFor(() =>
      expect(actions.markNotificationReadAction).toHaveBeenCalledWith("n-0"),
    );
  });
});
