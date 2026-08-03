"use client";

import { useMemo, useState } from "react";

import type { BurndownPoint } from "@/lib/analytics/types";
import { formatChartDate, niceCeil, useMeasuredWidth } from "./chart-utils";

interface BurndownChartProps {
  data: BurndownPoint[];
}

const HEIGHT = 300;
const MARGIN = { top: 16, right: 20, bottom: 28, left: 48 };
// Remaining-work series. Uses --chart-2 (not --chart-1): --chart-1 is the
// palest ramp rung and measures only 1.81:1 on the white card (fails WCAG 3:1
// for graphical objects); --chart-2 clears 3:1 in both themes (3.76 light /
// 4.73 dark) and matches the prior #3b82f6. See US-049 evidence.
const LINE_COLOR = "var(--chart-2)";

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

export function BurndownChart({ data }: BurndownChartProps) {
  const [containerRef, width] = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);

  const hasEstimatedWork = data.some((d) => d.remainingHours > 0);

  const geom = useMemo(() => {
    const plotLeft = MARGIN.left;
    const plotRight = width - MARGIN.right;
    const plotTop = MARGIN.top;
    const plotBottom = HEIGHT - MARGIN.bottom;
    const plotW = Math.max(1, plotRight - plotLeft);
    const plotH = Math.max(1, plotBottom - plotTop);

    const maxValue = Math.max(
      0,
      ...data.map((d) => d.remainingHours),
      ...data.map((d) => d.idealHours ?? 0),
    );
    const yMax = niceCeil(maxValue);

    const n = data.length;
    const xFor = (i: number) =>
      n <= 1 ? plotLeft + plotW / 2 : plotLeft + (i / (n - 1)) * plotW;
    const yFor = (v: number) => plotBottom - (v / yMax) * plotH;

    const line = (values: (number | null)[]) =>
      values
        .map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(v ?? 0).toFixed(2)}`)
        .join(" ");

    const remainingLine = line(data.map((d) => d.remainingHours));
    const idealLine = line(data.map((d) => d.idealHours));

    const firstX = xFor(0);
    const lastX = xFor(n - 1);
    const areaPath = n
      ? `${remainingLine} L ${lastX.toFixed(2)} ${plotBottom} L ${firstX.toFixed(2)} ${plotBottom} Z`
      : "";

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
      y: plotBottom - r * plotH,
      value: Math.round(yMax * r),
    }));

    const tickCount = Math.min(6, n);
    const rawIdx =
      n <= 1
        ? [0]
        : Array.from({ length: tickCount }, (_, k) =>
            Math.round((k / (tickCount - 1)) * (n - 1)),
          );
    const xTicks = [...new Set(rawIdx)].map((i) => ({
      x: xFor(i),
      label: formatChartDate(data[i].date),
    }));

    return {
      plotLeft,
      plotRight,
      plotTop,
      plotBottom,
      plotW,
      yFor,
      xFor,
      remainingLine,
      idealLine,
      areaPath,
      yTicks,
      xTicks,
    };
  }, [data, width]);

  if (data.length === 0 || !hasEstimatedWork) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Remaining estimated work</h2>
        <div className="flex h-[260px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {data.length === 0
            ? "No data available for the selected period."
            : "No estimated work in this range yet. Add hour estimates to cards to track remaining work over time."}
        </div>
      </div>
    );
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xUser = (e.clientX - rect.left) * (width / rect.width);
    if (data.length <= 1) {
      setHover(0);
      return;
    }
    const ratio = (xUser - geom.plotLeft) / geom.plotW;
    const i = Math.round(ratio * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const hoverPt = hover != null ? data[hover] : null;
  const hoverX = hover != null ? geom.xFor(hover) : 0;
  const tooltipLeftPct = Math.min(94, Math.max(6, (hoverX / width) * 100));

  const start = data[0]?.remainingHours ?? 0;
  const end = data[data.length - 1]?.remainingHours ?? 0;
  const delta = Math.round(end - start);

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Remaining estimated work</h2>
          <p className="text-xs text-muted-foreground">
            Estimated hours on open cards over time (estimated cards only).
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: LINE_COLOR }} aria-hidden="true" />
            Remaining
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-muted-foreground/60" aria-hidden="true" />
            Projection
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-[300px] w-full"
        onMouseLeave={() => setHover(null)}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="overflow-visible"
          onMouseMove={onMove}
        >
          <defs>
            <linearGradient id="burndownArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE_COLOR} stopOpacity="0.18" />
              <stop offset="100%" stopColor={LINE_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines + y-axis labels */}
          {geom.yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={geom.plotLeft}
                y1={t.y}
                x2={geom.plotRight}
                y2={t.y}
                className="text-border"
                stroke="currentColor"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={geom.plotLeft - 8}
                y={t.y}
                dy="0.32em"
                textAnchor="end"
                className="text-[11px] text-muted-foreground"
                fill="currentColor"
              >
                {formatHours(t.value)}
              </text>
            </g>
          ))}

          {/* x-axis date labels */}
          {geom.xTicks.map((t, i) => (
            <text
              key={i}
              x={t.x}
              y={geom.plotBottom + 18}
              textAnchor="middle"
              className="text-[11px] text-muted-foreground"
              fill="currentColor"
            >
              {t.label}
            </text>
          ))}

          {/* Area under the remaining line */}
          <path d={geom.areaPath} fill="url(#burndownArea)" stroke="none" />

          {/* Ideal line */}
          <path
            d={geom.idealLine}
            fill="none"
            stroke="currentColor"
            className="text-muted-foreground/60"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />

          {/* Remaining line */}
          <path
            d={geom.remainingLine}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Hover guide + marker */}
          {hoverPt && (
            <>
              <line
                x1={hoverX}
                y1={geom.plotTop}
                x2={hoverX}
                y2={geom.plotBottom}
                className="text-border"
                stroke="currentColor"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={hoverX}
                cy={geom.yFor(hoverPt.remainingHours)}
                r={4}
                fill={LINE_COLOR}
                stroke="var(--card)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {hoverPt && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
            style={{ left: `${tooltipLeftPct}%` }}
          >
            <div className="font-medium">{formatChartDate(hoverPt.date)}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: LINE_COLOR }}
                aria-hidden="true"
              />
              Remaining {formatHours(Math.round(hoverPt.remainingHours))}
            </div>
            {hoverPt.idealHours != null && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                Projection {formatHours(Math.round(hoverPt.idealHours))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4 text-sm">
        <div>
          <span className="text-muted-foreground">Start</span>
          <div className="font-medium">{formatHours(Math.round(start))}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Now</span>
          <div className="font-medium">{formatHours(Math.round(end))}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Change</span>
          <div className={`font-medium ${delta <= 0 ? "text-success-foreground" : "text-destructive"}`}>
            {delta <= 0 ? "−" : "+"}
            {formatHours(Math.abs(delta))}
          </div>
        </div>
      </div>
    </div>
  );
}
