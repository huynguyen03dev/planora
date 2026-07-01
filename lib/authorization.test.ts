import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth";

const h = vi.hoisted(() => ({
  hasPermission: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { hasPermission: h.hasPermission } } }));
vi.mock("@/lib/prisma", () => ({ default: {}, db: {} }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("server-only", () => ({}));

import { hasWorkspacePermission } from "@/lib/authorization";

const WS = "workspace-1";

describe("hasWorkspacePermission — US-059 non-member denial normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the caller's role grants the requested permission", async () => {
    h.hasPermission.mockResolvedValue({ success: true });

    await expect(hasWorkspacePermission(WS, { board: ["update"] })).resolves.toBe(true);
  });

  it("returns false when the caller's role denies the requested permission", async () => {
    h.hasPermission.mockResolvedValue({ success: false });

    await expect(hasWorkspacePermission(WS, { board: ["delete"] })).resolves.toBe(false);
  });

  it("returns false (not a throw) when the caller is not a member of the organization", async () => {
    // Mirrors Better Auth 1.5.5's organization.mjs:75 —
    // APIError.from("UNAUTHORIZED", USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION).
    h.hasPermission.mockRejectedValue(
      APIError.from("UNAUTHORIZED", {
        message: "You are not a member of this organization.",
        code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
      }),
    );

    await expect(hasWorkspacePermission(WS, { board: ["update"] })).resolves.toBe(false);
  });

  it("re-throws a non-UNAUTHORIZED APIError instead of swallowing it into a deny", async () => {
    // Mirrors has-permission.mjs's misconfigured-role/AC throw — a genuine 500
    // that must not be masked as a permission decision.
    h.hasPermission.mockRejectedValue(
      new APIError("INTERNAL_SERVER_ERROR", {
        message: "Invalid permissions for role editor",
      }),
    );

    await expect(hasWorkspacePermission(WS, { board: ["update"] })).rejects.toThrow(
      "Invalid permissions for role editor",
    );
  });

  it("re-throws a non-APIError failure (e.g. a network/DB error) unchanged", async () => {
    h.hasPermission.mockRejectedValue(new Error("ECONNRESET"));

    await expect(hasWorkspacePermission(WS, { board: ["update"] })).rejects.toThrow("ECONNRESET");
  });
});
