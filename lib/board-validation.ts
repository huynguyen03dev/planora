import {
  BOARD_COLORS,
  DEFAULT_BOARD_COLOR,
  MAX_BOARD_TITLE_LENGTH,
  MIN_BOARD_TITLE_LENGTH,
} from "@/lib/constants";

const boardColorSet = new Set<string>(BOARD_COLORS.map((color) => color.value));

export function normalizeBoardTitle(rawTitle: string): string {
  return rawTitle.trim();
}

export function validateBoardTitle(rawTitle: string): string | null {
  const title = normalizeBoardTitle(rawTitle);

  if (title.length < MIN_BOARD_TITLE_LENGTH) {
    return "Board title is required";
  }

  if (title.length > MAX_BOARD_TITLE_LENGTH) {
    return `Board title must be ${MAX_BOARD_TITLE_LENGTH} characters or less`;
  }

  return null;
}

export function normalizeBoardColor(rawColor?: string | null): string {
  if (rawColor === null || rawColor === undefined) {
    return DEFAULT_BOARD_COLOR;
  }

  return rawColor;
}

export function validateBoardColor(rawColor?: string | null): string | null {
  if (rawColor === "") {
    return "Invalid board color";
  }

  const color = normalizeBoardColor(rawColor);

  if (!boardColorSet.has(color)) {
    return "Invalid board color";
  }

  return null;
}
