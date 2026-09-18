import { z } from "zod";

/**
 * The cursor's dueDate arrives via FormData: an ISO-8601 string for a dated
 * cursor, or an empty string for a no-due (null) cursor. A null dueDate is a
 * REAL cursor position — the no-due "Later" group sorts last in the server's
 * (dueDate asc nulls last, id asc) order — so it must be distinguishable from
 * "no cursor". Cursor presence is signaled by `cursorId` alone.
 */
const optionalCursorDueDate = z
  .string()
  .datetime({ offset: true })
  .or(z.literal(""))
  .optional();

/**
 * Input for `loadMoreTodayCardsAction` — explicit cursor pagination for the
 * `/today` personal read model (no silent cap). `limit` overrides the default
 * page size (TODAY_PAGE_SIZE); the cursor is the (dueDate, id) of the last
 * loaded card. A partial/absent `cursorId` means "first page".
 */
export const loadMoreTodayCardsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursorId: z
    .string()
    .uuid({ message: "Invalid cursor ID" })
    .or(z.literal(""))
    .optional(),
  cursorDueDate: optionalCursorDueDate,
});

export type LoadMoreTodayCardsInput = z.infer<typeof loadMoreTodayCardsSchema>;
