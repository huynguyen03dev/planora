import { describe, expect, it } from "vitest";

import {
  buildInboxItems,
  computeInboxBadgeCount,
  type InboxInvitationItem,
  type InboxNotificationItem,
} from "./inbox";

function notification(
  overrides: Partial<InboxNotificationItem> = {},
): InboxNotificationItem {
  return {
    id: "n1",
    type: "ASSIGNED",
    title: "Assigned to a card",
    message: "You were assigned to a card",
    linkUrl: "/boards/abc",
    isRead: false,
    createdAt: "2026-06-20T10:00:00.000Z",
    ...overrides,
  };
}

function invitation(
  overrides: Partial<InboxInvitationItem> = {},
): InboxInvitationItem {
  return {
    id: "i1",
    workspaceId: "w1",
    workspaceName: "Engineering",
    role: "editor",
    inviterName: "Dat",
    expiresAt: "2026-07-01T10:00:00.000Z",
    createdAt: "2026-06-20T09:00:00.000Z",
    ...overrides,
  };
}

describe("buildInboxItems", () => {
  it("pins invitations above notifications regardless of recency", () => {
    const items = buildInboxItems(
      [notification({ id: "n1", createdAt: "2026-06-25T10:00:00.000Z" })],
      [invitation({ id: "i1", createdAt: "2026-06-01T10:00:00.000Z" })],
    );

    expect(items.map((item) => item.kind)).toEqual([
      "invitation",
      "notification",
    ]);
    expect(items[0]).toMatchObject({ kind: "invitation", id: "i1" });
  });

  it("orders invitations soonest-to-expire first", () => {
    const items = buildInboxItems(
      [],
      [
        invitation({ id: "later", expiresAt: "2026-07-10T00:00:00.000Z" }),
        invitation({ id: "soonest", expiresAt: "2026-07-02T00:00:00.000Z" }),
        invitation({ id: "mid", expiresAt: "2026-07-05T00:00:00.000Z" }),
      ],
    );

    expect(items.map((item) => item.id)).toEqual(["soonest", "mid", "later"]);
  });

  it("orders notifications most-recent first", () => {
    const items = buildInboxItems(
      [
        notification({ id: "old", createdAt: "2026-06-01T00:00:00.000Z" }),
        notification({ id: "new", createdAt: "2026-06-26T00:00:00.000Z" }),
        notification({ id: "mid", createdAt: "2026-06-15T00:00:00.000Z" }),
      ],
      [],
    );

    expect(items.map((item) => item.id)).toEqual(["new", "mid", "old"]);
  });

  it("tags each item with its kind", () => {
    const items = buildInboxItems([notification()], [invitation()]);
    const kinds = new Set(items.map((item) => item.kind));
    expect(kinds).toEqual(new Set(["invitation", "notification"]));
  });

  it("returns an empty list when there is nothing", () => {
    expect(buildInboxItems([], [])).toEqual([]);
  });
});

describe("computeInboxBadgeCount", () => {
  it("sums unread notifications and pending invitations", () => {
    expect(computeInboxBadgeCount(3, 2)).toBe(5);
  });

  it("is zero when both are zero", () => {
    expect(computeInboxBadgeCount(0, 0)).toBe(0);
  });

  it("clamps negative inputs to zero", () => {
    expect(computeInboxBadgeCount(-4, 2)).toBe(2);
    expect(computeInboxBadgeCount(1, -9)).toBe(1);
  });
});
