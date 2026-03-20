"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import { BOARD_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type ColorPaletteProps = {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
};

export function ColorPalette({
  value,
  onChange,
  disabled = false,
}: ColorPaletteProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {BOARD_COLORS.map((color) => {
        const isActive = color.value === value;

        return (
          <button
            key={color.value}
            type="button"
            className={cn(
              "relative h-10 w-full rounded-md border border-black/10 transition-opacity",
              isActive ? "ring-2 ring-ring ring-offset-1" : "hover:opacity-90",
            )}
            style={{ backgroundColor: color.value }}
            onClick={() => onChange(color.value)}
            aria-label={color.name}
            aria-pressed={isActive}
            disabled={disabled}
          >
            {isActive ? (
              <span className="absolute inset-0 flex items-center justify-center text-white">
                <HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={2.5} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
