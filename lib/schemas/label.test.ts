import { describe, expect, it } from "vitest";

import {
  createLabelSchema,
  updateLabelSchema,
  addCardLabelSchema,
} from "./label";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID_2 = "22222222-2222-4222-8222-222222222222";
const PALETTE_COLOR = "#0079BF"; // first BOARD_COLORS value

describe("label schemas", () => {
  describe("createLabelSchema", () => {
    it("accepts a valid name + palette color on a real board id", () => {
      const result = createLabelSchema.safeParse({
        boardId: UUID,
        name: "Bug",
        color: PALETTE_COLOR,
      });
      expect(result.success).toBe(true);
    });

    it("trims the name", () => {
      const result = createLabelSchema.safeParse({
        boardId: UUID,
        name: "  Bug  ",
        color: PALETTE_COLOR,
      });
      expect(result.success && result.data.name).toBe("Bug");
    });

    it("rejects an empty name", () => {
      const result = createLabelSchema.safeParse({
        boardId: UUID,
        name: "   ",
        color: PALETTE_COLOR,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a color outside the palette", () => {
      const result = createLabelSchema.safeParse({
        boardId: UUID,
        name: "Bug",
        color: "#123456",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-uuid board id", () => {
      const result = createLabelSchema.safeParse({
        boardId: "not-a-uuid",
        name: "Bug",
        color: PALETTE_COLOR,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a name over the max length", () => {
      const result = createLabelSchema.safeParse({
        boardId: UUID,
        name: "x".repeat(51),
        color: PALETTE_COLOR,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateLabelSchema", () => {
    it("accepts a valid label update", () => {
      const result = updateLabelSchema.safeParse({
        labelId: UUID,
        name: "Feature",
        color: PALETTE_COLOR,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("addCardLabelSchema", () => {
    it("requires both ids to be uuids", () => {
      expect(
        addCardLabelSchema.safeParse({ cardId: UUID, labelId: UUID_2 }).success,
      ).toBe(true);
      expect(
        addCardLabelSchema.safeParse({ cardId: "x", labelId: UUID_2 }).success,
      ).toBe(false);
    });
  });
});
