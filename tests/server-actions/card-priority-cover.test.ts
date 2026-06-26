/**
 * US-017 / US-018 — Server Action tests for card priority and card cover.
 *
 * Same A1 (auth) / A2 (permission) / A3 (workspace isolation) contract as the
 * US-006 suite, plus the behavior these two stories actually promise:
 *   - priority: maps the "NONE" sentinel to null, rejects non-enum values,
 *     writes the enum value once an editor is allowed.
 *   - cover: removal (null) is always allowed; a non-null cover URL is accepted
 *     ONLY when it matches one of the card's own attachments — an external URL
 *     is rejected (US-018 anti-tracking-pixel contract). This is the regression
 *     guard for the security hole where any `z.string().url()` was accepted.
 *
 * The auth seam (`auth.api.hasPermission`) is mocked one layer below
 * `hasWorkspacePermission`, so the real resource→workspace derivation runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cardWithListAndBoardFixture,
  expectNoWrites,
  formData,
  roleGrants,
  type Role,
} from "./_harness";

const WS_A = "A".repeat(31) + "1";
const WS_B = "B".repeat(31) + "2";
const CARD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OWN_URL = "https://res.cloudinary.com/demo/image/upload/own.png";
const EXTERNAL_URL = "https://evil.example.com/tracking-pixel.gif";

const h = vi.hoisted(() => {
  const state = {
    callerId: null as string | null,
    authed: true,
    membership: new Map<string, "admin" | "editor" | "viewer">(),
  };
  const checkRef = {
    fn: null as null | ((ws: string, perms: Record<string, string[]>) => boolean),
  };
  const fn = () => vi.fn();
  return {
    state,
    checkRef,
    verifySession: vi.fn(async () => {
      if (!state.authed || !state.callerId) throw new Error("NEXT_REDIRECT");
      return { userId: state.callerId };
    }),
    hasPermission: vi.fn(
      async ({
        body,
      }: {
        body: { organizationId: string; permissions: Record<string, string[]> };
      }) => ({
        success: checkRef.fn
          ? checkRef.fn(body.organizationId, body.permissions)
          : false,
      }),
    ),
    // loaders
    getCardWithListAndBoard: fn(),
    getAttachmentsByCardId: fn(),
    // card write seams
    updateCardPriority: fn(),
    updateCardCover: fn(),
    // attachment / activity / cloudinary (setCardCoverAction)
    createAttachment: fn(),
    createActivityEntry: fn(),
    uploadToCloudinary: fn(),
    db: {
      card: { update: vi.fn() },
    },
    emit: {
      emitAnalyticsRefresh: fn(),
      emitCardMoved: fn(),
      emitListMoved: fn(),
      emitListCreated: fn(),
      emitListUpdated: fn(),
      emitListDeleted: fn(),
      emitCardCreated: fn(),
      emitCardUpdated: fn(),
      emitCardArchived: fn(),
      emitCardLabelsUpdated: fn(),
      emitCommentCreated: fn(),
    },
  };
});

vi.mock("@/lib/dal", () => ({ verifySession: h.verifySession }));
vi.mock("@/lib/auth", () => ({ auth: { api: { hasPermission: h.hasPermission } } }));
vi.mock("@/lib/prisma", () => ({ default: h.db, db: h.db }));
vi.mock("@/lib/board", () => ({ getBoardById: vi.fn() }));
vi.mock("@/lib/list", () => ({
  getListWithBoard: vi.fn(),
  createList: vi.fn(),
  updateListTitle: vi.fn(),
  updateListIsDone: vi.fn(),
  reorderListByNeighbors: vi.fn(),
}));
vi.mock("@/lib/card", () => ({
  getCardWithListAndBoard: h.getCardWithListAndBoard,
  getArchivedCardWithListAndBoard: vi.fn(),
  getCardWithListAndMembers: vi.fn(),
  updateCardDetails: vi.fn(),
  reorderCardWithinListByNeighbors: vi.fn(),
  updateCardPriority: h.updateCardPriority,
  updateCardCover: h.updateCardCover,
}));
vi.mock("@/lib/label", () => ({
  getLabelWithBoard: vi.fn(),
  getCardLabels: vi.fn(),
  getCardIdsWithLabel: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
  addCardLabel: vi.fn(),
  removeCardLabel: vi.fn(),
}));
vi.mock("@/lib/comment", () => ({ createComment: vi.fn() }));
vi.mock("@/lib/attachment", () => ({
  createAttachment: h.createAttachment,
  getAttachmentsByCardId: h.getAttachmentsByCardId,
}));
vi.mock("@/lib/activity", () => ({ createActivityEntry: h.createActivityEntry }));
vi.mock("@/lib/notification", () => ({
  notifyCardAssigned: vi.fn(),
  notifyCommentOnCard: vi.fn(),
  notifyMentioned: vi.fn(),
}));
vi.mock("@/lib/cloudinary", () => ({
  validateFileForUpload: vi.fn(),
  uploadToCloudinary: h.uploadToCloudinary,
  getCloudinaryConfig: vi.fn(() => ({ cloudName: "c", apiKey: "k", apiSecret: "s" })),
}));
vi.mock("@/lib/realtime/server", () => ({ ...h.emit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

h.checkRef.fn = (ws, perms) => {
  const role = h.state.membership.get(`${h.state.callerId}:${ws}`);
  return roleGrants(role, perms);
};

import {
  updateCardPriorityAction,
  updateCardCoverAction,
  setCardCoverAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";

const writeSeams = [
  h.updateCardPriority,
  h.updateCardCover,
  h.createAttachment,
  h.createActivityEntry,
  h.uploadToCloudinary,
];

function signInAs(userId: string, ws: string, role: Role) {
  h.state.authed = true;
  h.state.callerId = userId;
  h.state.membership.set(`${userId}:${ws}`, role);
}
function signOut() {
  h.state.authed = false;
  h.state.callerId = null;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.callerId = null;
  h.state.authed = true;
  h.state.membership.clear();
  h.getCardWithListAndBoard.mockResolvedValue(cardWithListAndBoardFixture(WS_A));
  h.updateCardPriority.mockResolvedValue({ id: CARD_ID, priority: "HIGH" });
  h.updateCardCover.mockResolvedValue({ id: CARD_ID, coverImage: null });
});

/* ─── updateCardPriorityAction (card:update) ─────────────────────────────── */

describe("updateCardPriorityAction", () => {
  const form = (priority = "HIGH") => formData({ cardId: CARD_ID, priority });

  it("A1 auth — signed out throws, no write", async () => {
    signOut();
    await expect(updateCardPriorityAction(form())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 viewer denied — Card not found, no write", async () => {
    signInAs("u", WS_A, "viewer");
    expect(await updateCardPriorityAction(form())).toEqual({
      success: false,
      error: "Card not found",
    });
    expectNoWrites(...writeSeams);
  });

  it("A3 WS-B editor denied (isolation) — Card not found, no write", async () => {
    signInAs("u", WS_B, "editor");
    expect(await updateCardPriorityAction(form())).toEqual({
      success: false,
      error: "Card not found",
    });
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A editor writes the enum value", async () => {
    signInAs("u", WS_A, "editor");
    const result = await updateCardPriorityAction(form("URGENT"));
    expect(h.updateCardPriority).toHaveBeenCalledWith(CARD_ID, "URGENT");
    expect(result).toEqual({ success: true, card: { id: CARD_ID, priority: "HIGH" } });
  });

  it("maps the NONE sentinel to null (clears priority)", async () => {
    signInAs("u", WS_A, "editor");
    await updateCardPriorityAction(form("NONE"));
    expect(h.updateCardPriority).toHaveBeenCalledWith(CARD_ID, null);
  });

  it("rejects a non-enum priority value before any write", async () => {
    signInAs("u", WS_A, "editor");
    const result = await updateCardPriorityAction(form("SUPER_URGENT"));
    expect(result.success).toBe(false);
    expectNoWrites(...writeSeams);
  });
});

/* ─── updateCardCoverAction (card:update) ────────────────────────────────── */

describe("updateCardCoverAction", () => {
  const form = (coverImage: string) => formData({ cardId: CARD_ID, coverImage });

  it("A1 auth — signed out throws, no write", async () => {
    signOut();
    await expect(updateCardCoverAction(form(OWN_URL))).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 viewer denied — Card not found, no write", async () => {
    signInAs("u", WS_A, "viewer");
    expect(await updateCardCoverAction(form(OWN_URL))).toEqual({
      success: false,
      error: "Card not found",
    });
    expectNoWrites(...writeSeams);
  });

  it("A3 WS-B editor denied (isolation) — Card not found, no write", async () => {
    signInAs("u", WS_B, "editor");
    expect(await updateCardCoverAction(form(OWN_URL))).toEqual({
      success: false,
      error: "Card not found",
    });
    expectNoWrites(...writeSeams);
  });

  it("SECURITY: rejects an external URL that is not one of the card's attachments", async () => {
    signInAs("u", WS_A, "editor");
    h.getAttachmentsByCardId.mockResolvedValue([
      { fileUrl: OWN_URL, fileType: "image/png" },
    ]);
    const result = await updateCardCoverAction(form(EXTERNAL_URL));
    expect(result).toEqual({
      success: false,
      error: "Cover image must be one of this card's attachments.",
    });
    expect(h.updateCardCover).not.toHaveBeenCalled();
  });

  it("allow: WS-A editor sets a cover that IS one of the card's attachments", async () => {
    signInAs("u", WS_A, "editor");
    h.getAttachmentsByCardId.mockResolvedValue([
      { fileUrl: OWN_URL, fileType: "image/png" },
    ]);
    const result = await updateCardCoverAction(form(OWN_URL));
    expect(h.updateCardCover).toHaveBeenCalledWith(CARD_ID, OWN_URL);
    expect(result.success).toBe(true);
  });

  it("allow: removal (empty → null) never consults attachments", async () => {
    signInAs("u", WS_A, "editor");
    const result = await updateCardCoverAction(form(""));
    expect(h.updateCardCover).toHaveBeenCalledWith(CARD_ID, null);
    expect(h.getAttachmentsByCardId).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

/* ─── setCardCoverAction (upload path, card:update) ──────────────────────── */

describe("setCardCoverAction", () => {
  function fileForm() {
    const fd = new FormData();
    fd.set("cardId", CARD_ID);
    fd.set(
      "file",
      new File([new Uint8Array([1, 2, 3, 4])], "cover.png", { type: "image/png" }),
    );
    return fd;
  }

  it("A1 auth — signed out throws, no write", async () => {
    signOut();
    await expect(setCardCoverAction(fileForm())).rejects.toThrow();
    expectNoWrites(...writeSeams);
  });

  it("A2 viewer denied — Card not found, no upload", async () => {
    signInAs("u", WS_A, "viewer");
    expect(await setCardCoverAction(fileForm())).toEqual({
      success: false,
      error: "Card not found",
    });
    expectNoWrites(...writeSeams);
  });

  it("allow: WS-A editor uploads, attaches, and sets the returned secure URL as cover", async () => {
    signInAs("u", WS_A, "editor");
    h.uploadToCloudinary.mockResolvedValue({
      secureUrl: OWN_URL,
      publicId: "pid",
      resourceType: "image",
    });
    h.createAttachment.mockResolvedValue({ id: "att-1", fileUrl: OWN_URL });
    h.updateCardCover.mockResolvedValue({ id: CARD_ID, coverImage: OWN_URL });

    const result = await setCardCoverAction(fileForm());
    expect(h.uploadToCloudinary).toHaveBeenCalled();
    expect(h.createAttachment).toHaveBeenCalled();
    expect(h.updateCardCover).toHaveBeenCalledWith(CARD_ID, OWN_URL);
    expect(result.success).toBe(true);
  });
});
