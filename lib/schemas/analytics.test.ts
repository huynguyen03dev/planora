import { describe, expect, it } from "vitest";

import { loadMoreLeadTimeRowsSchema } from "./analytics";

// Real Better Auth organization ids are 32-char alphanumeric nanoids (no
// dashes, no UUID shape). Pre-migration/seeded workspaces may still carry
// standard UUID ids — the schema must accept both and reject garbage.
const NANO_ID = "n".repeat(31) + "1";
const NANO_ID_HEX = "a".repeat(32); // 32-char hex, the other documented form
const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

const FROM = "2026-02-01T00:00:00.000Z";
const TO = "2026-02-28T00:00:00.000Z";

function validInput(workspaceId: string) {
  return {
    workspaceId,
    from: FROM,
    to: TO,
    offset: "100",
    limit: "100",
  };
}

describe("loadMoreLeadTimeRowsSchema", () => {
  it("accepts a real 32-char Better Auth nanoid workspace id (no dashes)", () => {
    const result = loadMoreLeadTimeRowsSchema.safeParse(validInput(NANO_ID));
    expect(result.success).toBe(true);
  });

  it("accepts a 32-char hex workspace id (no dashes)", () => {
    const result = loadMoreLeadTimeRowsSchema.safeParse(validInput(NANO_ID_HEX));
    expect(result.success).toBe(true);
  });

  it("still accepts a standard UUID workspace id", () => {
    const result = loadMoreLeadTimeRowsSchema.safeParse(validInput(UUID));
    expect(result.success).toBe(true);
  });

  it("rejects garbage workspace ids with the exact user-facing message", () => {
    for (const bad of [
      "not-a-uuid",
      "n".repeat(31), // too short
      "n".repeat(33), // too long
      "11111111-1111-4111-8111-11111111111", // UUID shape but wrong length
    ]) {
      const result = loadMoreLeadTimeRowsSchema.safeParse(validInput(bad));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          Object.values(result.error.flatten().fieldErrors)[0]?.[0],
        ).toBe("Invalid workspace ID");
      }
    }
  });
});
