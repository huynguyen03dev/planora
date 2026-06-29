// Shared "on colored header" control treatment. The board header is an
// always-colored gradient (boardTheme.header) regardless of light/dark, so its
// controls must NOT use theme tokens (bg-background/bg-secondary etc.) — those
// flip to near-black in dark mode and render as black buttons on the colored
// header. This translucent-white-over-color treatment reads correctly on any
// header color in both themes, and matches the Share/Star/Menu buttons.
export const boardHeaderControlClass =
  "rounded-full border-white/40 bg-white/15 text-white hover:bg-white/25";

// Stronger fill for an active/pressed control (filter applied, labels expanded).
// Pairs with aria-pressed/aria-* so the state is never conveyed by fill alone.
export const boardHeaderControlActiveClass = "border-white/70 bg-white/30 text-white hover:bg-white/35";

// Ring/fill for the live-presence avatars so they read on the colored header
// instead of inheriting the dark theme's near-black ring-background + bg-muted.
// A dark ring keeps the avatars light (clean on the colored header in both
// themes) while still giving each a clear outline that separates them where they
// overlap (-space-x-2) — the ring just has to contrast the light fill.
export const boardHeaderAvatarRingClass = "*:data-[slot=avatar]:ring-black/40";
export const boardHeaderAvatarFallbackClass = "bg-white text-slate-700";
