/**
 * US-083 W6 — the authenticated global chrome hosts the discoverable Today
 * entry (nav presence, not the nav's own active-state behavior — that is
 * proven in components/today/today-nav-link.test.tsx).
 *
 * The layout is an async RSC: `verifySession`, the two badge-count readers,
 * and the socket lifecycle provider are mocked; the header actions are
 * stubbed out (their own contract is covered elsewhere). What is proven here:
 * every authenticated route renders a "Today" link pointing at `/today`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  verifySession: vi.fn(async () => ({
    userId: "user-1",
    user: { id: "user-1", name: "QA", email: "qa@e2e.test" },
  })),
  unreadCount: vi.fn(async () => 0),
  invitationCount: vi.fn(async () => 0),
  usePathname: vi.fn(() => "/boards"),
}));

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/notification", () => ({ getUnreadNotificationCount: h.unreadCount }));
vi.mock("@/lib/invitation", () => ({ getPendingInvitationCount: h.invitationCount }));
vi.mock("@/lib/workspace", () => ({
  listWorkspaceMembershipsByUserId: vi.fn(async () => []),
}));
vi.mock("@/lib/realtime/socket-lifecycle-provider", () => ({
  SocketLifecycleProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/authenticated-header-actions", () => ({
  AuthenticatedHeaderActions: () => null,
}));
vi.mock("next/navigation", () => ({ usePathname: h.usePathname }));

import AuthenticatedLayout from "./layout";

describe("AuthenticatedLayout — global chrome (US-083 W6)", () => {
  it("renders the Today nav entry from every authenticated route", async () => {
    const element = await AuthenticatedLayout({ children: <div>page</div> });
    render(element);

    const today = screen.getByRole("link", { name: "Today" });
    expect(today).toHaveAttribute("href", "/today");
    expect(screen.getByRole("link", { name: "Planora" })).toHaveAttribute("href", "/boards");
    expect(screen.getByText("page")).toBeInTheDocument();
  });
});
