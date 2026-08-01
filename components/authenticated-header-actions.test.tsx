import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

/**
 * US-083 W2 — `AuthenticatedHeaderActions` live invitation badge.
 *
 * Proves the client half of the live-arrival contract:
 * - a typed `invitation:new` on the session socket increments the badge
 *   without any navigation or fetch;
 * - the connect-time resync reads BOTH badge halves (unread + invitations)
 *   from the authoritative Server Action, so a reconnect heals drift from the
 *   DB rather than trusting stale increment-only state (mirrors US-062 mn8);
 * - the SSR-provided counts seed the badge.
 *
 * `initSocket` is mocked to a fake emitter so tests drive the real handlers
 * the component subscribes to.
 */

const h = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return socket;
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
      return socket;
    }),
    handlers,
  };
  return {
    socket,
    getInboxBadgeCountsAction: vi.fn(),
    routerReplace: vi.fn(),
  };
});

vi.mock("@/lib/realtime/client", () => ({ initSocket: () => h.socket }));
vi.mock("@/app/(authenticated)/actions", () => ({
  getInboxBadgeCountsAction: h.getInboxBadgeCountsAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.routerReplace }),
  usePathname: () => "/boards",
  useSearchParams: () => new URLSearchParams(),
}));
// Presentational/independent children — not under test here.
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/user-button", () => ({ UserButton: () => null }));
vi.mock("@/components/boards/create-workspace-modal", () => ({
  CreateWorkspaceModal: () => null,
}));
vi.mock("@/components/notifications/notification-dropdown", () => ({
  NotificationDropdown: () => null,
}));

import { AuthenticatedHeaderActions } from "./authenticated-header-actions";

function fire(event: string, ...args: unknown[]) {
  const handler = h.socket.handlers.get(event);
  if (!handler) throw new Error(`No handler subscribed for ${event}`);
  handler(...args);
}

function bell() {
  return screen.getByRole("button", { name: /notifications/i });
}

describe("AuthenticatedHeaderActions — live invitation badge (US-083 W2)", () => {
  beforeEach(() => {
    h.socket.handlers.clear();
    h.socket.on.mockClear();
    h.socket.off.mockClear();
    h.getInboxBadgeCountsAction.mockReset();
  });

  it("seeds the badge from the SSR-provided counts", () => {
    render(
      <AuthenticatedHeaderActions initialUnreadCount={1} initialInvitationCount={2} />,
    );
    expect(bell()).toHaveAccessibleName("Notifications (3 unread)");
  });

  it("increments the badge on a live invitation:new with no fetch or navigation", async () => {
    render(
      <AuthenticatedHeaderActions initialUnreadCount={0} initialInvitationCount={0} />,
    );
    expect(bell()).toHaveAccessibleName("Notifications");

    // The socket handler is a raw event callback, so the state update it
    // triggers must be flushed inside act() — same production-binding
    // assertion, no unwrapped-update warning on stderr.
    await act(async () => {
      fire("invitation:new", { invitationId: "inv-1" });
    });

    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (1 unread)"));
    expect(h.getInboxBadgeCountsAction).not.toHaveBeenCalled();
  });

  it("resyncs both badge halves from the DB-backed action on connect", async () => {
    h.getInboxBadgeCountsAction.mockResolvedValue({ unread: 2, invitations: 3 });
    render(
      <AuthenticatedHeaderActions initialUnreadCount={0} initialInvitationCount={0} />,
    );

    fire("connect");

    await waitFor(() =>
      expect(bell()).toHaveAccessibleName("Notifications (5 unread)"),
    );
    expect(h.getInboxBadgeCountsAction).toHaveBeenCalledTimes(1);
  });

  it("keeps the current badge when the connect resync fails (best-effort)", async () => {
    h.getInboxBadgeCountsAction.mockRejectedValue(new Error("network"));
    render(
      <AuthenticatedHeaderActions initialUnreadCount={1} initialInvitationCount={1} />,
    );

    fire("connect");

    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (2 unread)"));
  });
});
