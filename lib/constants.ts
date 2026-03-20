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
