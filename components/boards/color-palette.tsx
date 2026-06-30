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
              // Tonal hover (brightness filter), not an opacity step (DESIGN.md §68).
              // Active state is signalled by the ring + checkmark (non-color), not
              // color alone (WCAG 1.4.1).
              "relative h-10 w-full rounded-md border border-border transition-[filter]",
              isActive ? "ring-2 ring-ring ring-offset-1" : "hover:brightness-95",
            )}
            style={{ backgroundColor: color.value }}
            onClick={() => onChange(color.value)}
            aria-label={color.name}
            aria-pressed={isActive}
            disabled={disabled}
          >
            {isActive ? (
              <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]">
                <HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={2.5} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
