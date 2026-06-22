import { useEffect, useRef, useState } from "react";

// Round a max value up to a clean axis ceiling (1, 2, 2.5, 5 × 10ⁿ) so a series
// fills the vertical space without leaving an awkwardly large headroom.
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function formatChartDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

// Measure a container's pixel width so an SVG viewBox can map 1:1 to the
// rendered box — no squished plot area and no distorted (elliptical) markers.
export function useMeasuredWidth(initial = 800) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
