/**
 * Default fallback path for post-auth redirects when the requested
 * target is missing or not a same-origin internal path.
 */
export const DEFAULT_INTERNAL_PATH = "/boards";

/**
 * Validates a redirect query-param value and returns it only if it points
 * to a same-origin internal path. Otherwise returns {@link DEFAULT_INTERNAL_PATH}.
 *
 * Rules (preserved from the original duplicated guard in the sign-in / sign-up
 * pages and form):
 *  - must be a non-empty string
 *  - must start with "/" (internal path)
 *  - must NOT start with "//" (protocol-relative URL — would redirect off-site)
 *
 * Note: this is a quick sanity guard for the post-auth redirect target, not a
 * CSP replacement. It does not exhaustively parse the URL.
 */
export function safeInternalPath(path: string | undefined): string {
  return path && path.startsWith("/") && !path.startsWith("//")
    ? path
    : DEFAULT_INTERNAL_PATH;
}
