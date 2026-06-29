"use client";

import { cn } from "@/lib/utils";

export type LabelMarkItem = {
  id: string;
  name: string;
  color: string;
};

// Colorblind-safe textures (WCAG 1.4.1): the compact "bar" form conveys a label
// only by color, so each color also carries a deterministic stripe/dot pattern —
// two labels that read as the same hue to a colorblind user are still told apart
// by texture (the Trello colorblind-mode analogue, reference §7.3). The pattern
// is derived from the color string, so the same color always gets the same
// texture everywhere this primitive is used (card face here, card detail in
// US-043). The expanded "chip" form shows the name as text, which is itself the
// non-color channel, so it needs no overlay.
const TEXTURES: Array<{ backgroundImage: string; backgroundSize?: string }> = [
  { backgroundImage: "none" },
  { backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 1.5px, transparent 1.5px 4px)" },
  { backgroundImage: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.4) 0 1.5px, transparent 1.5px 4px)" },
  { backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0 1.5px, transparent 1.5px 4px)" },
  { backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.45) 0 1.5px, transparent 1.5px 4px)" },
  { backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 0.8px, transparent 1px)", backgroundSize: "4px 4px" },
];

function textureFor(color: string) {
  let hash = 0;
  for (let i = 0; i < color.length; i += 1) {
    hash = (hash * 31 + color.charCodeAt(i)) | 0;
  }
  return TEXTURES[Math.abs(hash) % TEXTURES.length];
}

type LabelMarkProps = {
  label: LabelMarkItem;
  variant: "bar" | "chip";
  className?: string;
};

// Shared label primitive for the card surfaces. `bar` = the compact 40×8 color
// bar; `chip` = the full text pill. Both expose the label name to assistive tech
// (the bar via aria-label since it has no visible text), so selection/identity is
// never color-only.
export function LabelMark({ label, variant, className }: LabelMarkProps) {
  if (variant === "bar") {
    const texture = textureFor(label.color);
    return (
      <span
        role="img"
        aria-label={label.name}
        title={label.name}
        className={cn("h-2 w-10 max-w-full rounded-sm", className)}
        style={{
          backgroundColor: label.color,
          backgroundImage: texture.backgroundImage,
          ...(texture.backgroundSize ? { backgroundSize: texture.backgroundSize } : null),
        }}
      />
    );
  }

  return (
    <span
      title={label.name}
      className={cn(
        "max-w-full truncate rounded px-2 py-0.5 text-xs font-medium text-white",
        className,
      )}
      style={{ backgroundColor: label.color }}
    >
      {label.name}
    </span>
  );
}
