/**
 * Client-safe automation constants (no server-only imports — the client
 * execution-log panel and the workspace RSC page both import this).
 *
 * Execution-log feed batch size (US-066 infinite scroll): ~30 rows ≈ a
 * viewport of feed rows. The workspace page's first batch and every
 * subsequent cursor page fetch this many; the panel always passes `take`
 * explicitly, so `getRuleExecutionLogAction`'s own default (100, the legacy
 * pre-pagination take) stays untouched for any caller that omits it.
 */
export const EXECUTION_LOG_PAGE_SIZE = 30;
