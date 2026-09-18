import { z } from "zod";

/**
 * Cursor fields arrive via FormData, so an absent cursor is either a missing
 * key (undefined) or an empty string. Both normalize to undefined; a real
 * cursor is a valid ISO-8601 timestamp.
 */
const optionalIsoDatetime = z
  .string()
  .datetime({ offset: true })
  .or(z.literal(""))
  .optional()
  .transform((value) => (value ? new Date(value) : undefined));

/**
 * Input for `loadMoreCardDetailAction` — cursor-paginated fetch of the next
 * page of comments or activity for a card detail sheet section. The cursor is
 * the (createdAt, id) of the last loaded entry; both halves must be present
 * for the cursor to apply (a partial/absent cursor means "first page").
 */
export const loadMoreCardDetailSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  section: z.enum(["comments", "activity"], {
    message: "Invalid section",
  }),
  cursorCreatedAt: optionalIsoDatetime,
  cursorId: z
    .string()
    .uuid({ message: "Invalid cursor ID" })
    .or(z.literal(""))
    .optional(),
});

export type LoadMoreCardDetailInput = z.infer<typeof loadMoreCardDetailSchema>;
