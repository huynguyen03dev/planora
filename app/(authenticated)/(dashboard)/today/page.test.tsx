/**
 * US-083 W6 — `/today` page wiring (async RSC): prove the seam
 * `verifySession` → `getPersonalWorkCards(session.user.id, { limit })` →
 * `TodayView` props, plus the metadata export. The read model and the client
 * boundary are mocked (their own contracts are proven in
 * tests/server-actions/today.test.ts and components/today/today-view.test.tsx)
 * so the wiring itself is asserted exactly: the session-derived user id flows
 * into the paginated read model, and the model's workspaceCount + items +
 * hasMore are handed to TodayView untouched. Renders the async RSC the way
 * the layout test does (await → render).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import type { TodayCard } from "@/lib/today";

const h = vi.hoisted(() => ({
  verifySession: vi.fn(),
  getPersonalWorkCards: vi.fn(),
  TodayView: vi.fn(
    (props: {
      workspaceCount: number;
      cards: TodayCard[];
      hasMore: boolean;
    }) => {
      void props;
      return null;
    },
  ),
}));

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/today-query", () => ({ getPersonalWorkCards: h.getPersonalWorkCards }));
vi.mock("@/components/today/today-view", () => ({ TodayView: h.TodayView }));

import TodayPage, { metadata } from "./page";

const SESSION_USER_ID = "user-7";

const CARD: TodayCard = {
  id: "card-1",
  title: "Ship it",
  dueDate: "2026-08-03T09:00:00.000Z",
  completedAt: null,
  priority: "HIGH",
  board: {
    id: "board-1",
    title: "Product Roadmap",
    workspaceId: "ws-a",
    workspace: { name: "Acme" },
  },
  list: { id: "list-1", title: "To Do" },
};

beforeEach(() => {
  h.verifySession.mockReset().mockResolvedValue({
    userId: SESSION_USER_ID,
    user: { id: SESSION_USER_ID, name: "QA", email: "qa@e2e.test" },
    session: {},
  });
  h.getPersonalWorkCards
    .mockReset()
    .mockResolvedValue({ workspaceCount: 1, items: [], hasMore: false });
  h.TodayView.mockReset().mockReturnValue(null);
});

describe("TodayPage — RSC wiring (US-083 W6)", () => {
  it("derives the read model from the session user id and requests the first page", async () => {
    h.getPersonalWorkCards.mockResolvedValue({
      workspaceCount: 2,
      items: [],
      hasMore: false,
    });

    const element = await TodayPage();
    render(element);

    expect(h.verifySession).toHaveBeenCalledTimes(1);
    expect(h.getPersonalWorkCards).toHaveBeenCalledTimes(1);
    expect(h.getPersonalWorkCards).toHaveBeenCalledWith(SESSION_USER_ID, {
      limit: 50,
    });
    expect(h.TodayView.mock.calls[0][0]).toMatchObject({
      workspaceCount: 2,
      cards: [],
      hasMore: false,
    });
  });

  it("hands the read model's first page through to TodayView untouched", async () => {
    h.getPersonalWorkCards.mockResolvedValue({
      workspaceCount: 1,
      items: [CARD],
      hasMore: true,
    });

    const element = await TodayPage();
    render(element);

    const props = h.TodayView.mock.calls[0][0];
    expect(props.workspaceCount).toBe(1);
    expect(props.cards).toEqual([CARD]);
    expect(props.hasMore).toBe(true);
  });

  it("exports the page metadata seam", () => {
    expect(metadata.title).toBe("Today");
  });
});
