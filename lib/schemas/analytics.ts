import { z } from "zod";

import { workspaceIdSchema } from "./invitation";

/**
 * Input for `loadMoreLeadTimeRowsAction` — offset-paginated read of the next
 * window of lead-time detail rows for the Analytics dashboard table.
 *
 * The from/to pair is the RESOLVED range the dashboard already displayed
 * (`analytics.filters.from/to` from the initial payload), not a re-derived
 * "now" — the workspace timezone and preset-to-range math happen server-side
 * at page render, so the load-more must echo the same dates to guarantee the
 * appended rows come from the identical set. boardId/memberId/
 * includeArchivedBoards mirror the page's parsed searchParams; offset is the
 * number of rows already displayed (fail loud when absent — a load-more
 * without a window position would silently repeat page 1).
 */
export const loadMoreLeadTimeRowsSchema = z.object({
  // Real workspace ids are Better Auth 32-char nanoids (workspaceIdSchema —
  // the same contract every other workspace schema uses); a plain
  // z.string().uuid() rejected them and broke load-more on real workspaces.
  // UUID ids are still accepted for seeded/legacy workspaces.
  workspaceId: z.union(
    [
      workspaceIdSchema,
      z.string().uuid({ message: "Invalid workspace ID" }),
    ],
    { error: "Invalid workspace ID" },
  ),
  from: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  to: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  boardId: z
    .string()
    .uuid({ message: "Invalid board ID" })
    .or(z.literal(""))
    .optional()
    .transform((value) => (value ? value : undefined)),
  memberId: z
    .string()
    .min(1)
    .max(255)
    .or(z.literal(""))
    .optional()
    .transform((value) => (value ? value : undefined)),
  includeArchivedBoards: z
    .literal("1")
    .or(z.literal(""))
    .optional()
    .transform((value) => value === "1"),
  offset: z.coerce.number().int().min(0, { message: "Invalid offset" }),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type LoadMoreLeadTimeRowsInput = z.infer<
  typeof loadMoreLeadTimeRowsSchema
>;
