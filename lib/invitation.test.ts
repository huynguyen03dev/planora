import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  invitation: { count: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ default: mockDb, db: mockDb }));

import { getPendingInvitationCount } from "./invitation";

/**
 * US-083 W2 — `getPendingInvitationCount` (the badge resync source).
 *
 * The header's connect-time resync must read authoritative pending-invitation
 * state from the DB. Better Auth lowercases BOTH user emails at sign-up
 * (verified: sign-up.mjs normalizes) and invitation emails on create, so
 * stored values are already lowercase; the input normalization here mirrors
 * `listReceivedPendingInvitationsByEmail` and the production query's
 * `mode: "insensitive"` match is defensive compatibility (legacy/mixed-case
 * rows or future drift), not a requirement of current storage behavior.
 */
describe("getPendingInvitationCount (US-083 W2)", () => {
  beforeEach(() => {
    mockDb.invitation.count.mockReset();
    mockDb.invitation.count.mockResolvedValue(2);
  });

  it("counts pending, unexpired invitations for the normalized email", async () => {
    await expect(getPendingInvitationCount("Bob@Example.com ")).resolves.toBe(2);

    expect(mockDb.invitation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: "bob@example.com",
          status: "pending",
          expiresAt: { gt: expect.any(Date) },
        },
      }),
    );
  });

  it("returns 0 without querying when the email is blank", async () => {
    await expect(getPendingInvitationCount("   ")).resolves.toBe(0);
    expect(mockDb.invitation.count).not.toHaveBeenCalled();
  });

  it("propagates the DB count verbatim", async () => {
    mockDb.invitation.count.mockResolvedValue(0);
    await expect(getPendingInvitationCount("bob@example.com")).resolves.toBe(0);
  });
});
