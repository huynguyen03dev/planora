// On-colored-header control treatment. The board header is an always-colored
// gradient regardless of light/dark, so its controls must NOT use theme tokens
// (bg-background/bg-secondary etc.) — those flip to near-black in dark mode and
// render as black buttons on the colored header. Translucent white over color
// reads correctly on any header color in both themes, matching Share/Star/Menu.
export const boardHeaderControlClass =
  "rounded-md border-white/40 bg-white/15 text-white hover:bg-white/25";

// Stronger fill for an active/pressed control (filter applied, labels expanded).
// Pairs with aria-pressed/aria-* so the state is never conveyed by fill alone.
export const boardHeaderControlActiveClass = "border-white/70 bg-white/30 text-white hover:bg-white/35";

// Live-presence avatars carry per-user colored fills (see lib/avatar). Where
// they overlap (-space-x-2) on the colored header, each disc gets a ring that
// is a LIGHTER TINT OF ITS OWN HUE (avatarRingClass) — a soft Trello-style
// separator, not the hard white ring it replaced (which read too prominent
// over the gradient). The per-hue ring is applied per-avatar in board-header.tsx.
//
// The overflow "+N" chip stays a neutral white disc (so it never collides with
// a user hue) with a matching white ring so it reads on any header color in both
// themes — overriding AvatarGroup's default ring-background, which would flip to
// near-black in dark mode.
export const boardHeaderAvatarCountClass = "bg-white text-slate-700 ring-white!";
