// Deterministic per-user avatar colors. A user's initials fallback gets a stable
// hue derived from a seed (their id), so the same person reads as the same color
// everywhere — mirroring Trello's assignee/presence coloring. Fills are solid
// with white initials; the same-hue border and separating ring are supplied by
// tokens/context. Fill-vs-white contrast is AA ≥4.5:1 (see the --avatar-*
// comment in app/globals.css for measured ratios).

export const AVATAR_HUES = [
  "blue",
  "green",
  "orange",
  "red",
  "purple",
  "pink",
  "teal",
  "gray",
] as const;

export type AvatarHue = (typeof AVATAR_HUES)[number];

// One full literal class string per hue so Tailwind's JIT can see every utility
// (dynamically-built class names would be purged). `border` supplies the width;
// the *-border token supplies the same-hue color; text is white in both themes.
const AVATAR_HUE_CLASS: Record<AvatarHue, string> = {
  blue: "border bg-avatar-blue border-avatar-blue-border text-primary-foreground",
  green: "border bg-avatar-green border-avatar-green-border text-primary-foreground",
  orange: "border bg-avatar-orange border-avatar-orange-border text-primary-foreground",
  red: "border bg-avatar-red border-avatar-red-border text-primary-foreground",
  purple: "border bg-avatar-purple border-avatar-purple-border text-primary-foreground",
  pink: "border bg-avatar-pink border-avatar-pink-border text-primary-foreground",
  teal: "border bg-avatar-teal border-avatar-teal-border text-primary-foreground",
  gray: "border bg-avatar-gray border-avatar-gray-border text-primary-foreground",
};

// Presence-ring color per hue: a lighter tint of the user's own fill, for the
// overlapping avatar group on the (always-colored) board header — separating
// discs softly instead of with a hard white ring. The `!` beats AvatarGroup's
// default `*:data-[slot=avatar]:ring-background`, which wins on specificity as a
// group-child selector. One full literal string per hue for the JIT.
const AVATAR_HUE_RING_CLASS: Record<AvatarHue, string> = {
  blue: "ring-avatar-blue-ring!",
  green: "ring-avatar-green-ring!",
  orange: "ring-avatar-orange-ring!",
  red: "ring-avatar-red-ring!",
  purple: "ring-avatar-purple-ring!",
  pink: "ring-avatar-pink-ring!",
  teal: "ring-avatar-teal-ring!",
  gray: "ring-avatar-gray-ring!",
};

/** Stable hue for a seed (djb-style hash, matching the label-mark pattern). */
export function avatarHue(seed: string): AvatarHue {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
}

/** Tailwind class string (fill + same-hue border + white text) for a seed. */
export function avatarColorClass(seed: string): string {
  return AVATAR_HUE_CLASS[avatarHue(seed)];
}

/**
 * Presence-ring class (lighter same-hue tint, `!important`) for a seed — for the
 * overlapping avatar group on the colored board header. Not applied to standalone
 * avatars, which don't overlap and need no separating ring.
 */
export function avatarRingClass(seed: string): string {
  return AVATAR_HUE_RING_CLASS[avatarHue(seed)];
}
