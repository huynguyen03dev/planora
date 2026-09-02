export const BOARD_COLORS = [
  { name: "Blue", value: "#0079BF" },
  { name: "Green", value: "#519839" },
  { name: "Orange", value: "#D29034" },
  { name: "Red", value: "#B04632" },
  { name: "Purple", value: "#89609E" },
  { name: "Pink", value: "#CD5A91" },
  { name: "Gray", value: "#838C91" },
  { name: "Teal", value: "#00AECC" },
] as const;

export const DEFAULT_BOARD_COLOR = BOARD_COLORS[0].value;

type BoardThemeGradient = {
  header: string;
  surface: string;
};

export const BOARD_THEME_GRADIENTS: Record<string, BoardThemeGradient> = {
  "#0079BF": {
    header: "linear-gradient(90deg, #0b3c74 0%, #0f5fb4 100%)",
    surface: "linear-gradient(135deg, #1c75d8 0%, #3294e7 100%)",
  },
  "#519839": {
    header: "linear-gradient(90deg, #2f6d29 0%, #3d8b33 100%)",
    surface: "linear-gradient(135deg, #4d9a43 0%, #67b955 100%)",
  },
  "#D29034": {
    header: "linear-gradient(90deg, #9b611f 0%, #bd7b2a 100%)",
    surface: "linear-gradient(135deg, #c9872c 0%, #e6a54a 100%)",
  },
  "#B04632": {
    header: "linear-gradient(90deg, #7f2d20 0%, #9f3b2a 100%)",
    surface: "linear-gradient(135deg, #ab3f2d 0%, #cf5a43 100%)",
  },
  "#89609E": {
    header: "linear-gradient(90deg, #5d4380 0%, #6f4d96 100%)",
    surface: "linear-gradient(135deg, #8a63b2 0%, #c677b8 100%)",
  },
  "#CD5A91": {
    header: "linear-gradient(90deg, #99406b 0%, #b54f80 100%)",
    surface: "linear-gradient(135deg, #c85a8f 0%, #de7ca7 100%)",
  },
  "#838C91": {
    header: "linear-gradient(90deg, #566069 0%, #6a757f 100%)",
    surface: "linear-gradient(135deg, #76838e 0%, #949ea7 100%)",
  },
  "#00AECC": {
    header: "linear-gradient(90deg, #00748a 0%, #0096b1 100%)",
    surface: "linear-gradient(135deg, #00a5c2 0%, #34bfd8 100%)",
  },
};

export function getBoardTheme(backgroundColor?: string | null): BoardThemeGradient {
  const color = backgroundColor ?? DEFAULT_BOARD_COLOR;
  return BOARD_THEME_GRADIENTS[color] ?? BOARD_THEME_GRADIENTS[DEFAULT_BOARD_COLOR];
}

export const MIN_BOARD_TITLE_LENGTH = 1;
export const MAX_BOARD_TITLE_LENGTH = 64;

/* ------------------------------------------------------------------ *
 * Meta-chip semantic ramp — single shared source (V3)                *
 * ------------------------------------------------------------------ *
 * Card-face and Today chips (priority + due). Priority maps to the   *
 * per-hue label tint pairs (US-051, decision 0014) and the US-050    *
 * status tokens (decision 0013), all AA-measured in app/globals.css  *
 * for both themes. The classes resolve from CSS vars, so each pair   *
 * adapts to dark mode automatically. The chips always render icon +  *
 * word (+ aria-label where stateful) — never color-only (WCAG 1.4.1).*
 * ------------------------------------------------------------------ */
export type CardPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export const PRIORITY_META_CHIP: Record<
  CardPriority,
  { label: string; className: string }
> = {
  URGENT: { label: "Urgent", className: "bg-label-red text-label-red-fg" },
  HIGH: { label: "High", className: "bg-label-orange text-label-orange-fg" },
  MEDIUM: {
    label: "Medium",
    className: "bg-warning text-warning-foreground",
  },
  LOW: { label: "Low", className: "bg-label-blue text-label-blue-fg" },
};

/** Card-face due-badge states (list-card-item). */
export type CardDueState = "overdue" | "today" | "soon" | "upcoming" | "done";

export const DUE_META_CHIP_CLASS: Record<CardDueState, string> = {
  overdue: "bg-destructive/10 text-destructive",
  today: "bg-warning text-warning-foreground",
  soon: "text-warning-foreground",
  upcoming: "text-muted-foreground",
  done: "text-success-foreground",
};
