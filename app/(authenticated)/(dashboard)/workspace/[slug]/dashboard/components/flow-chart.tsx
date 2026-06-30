"use client";

import { useMemo, useState } from "react";

import type { FlowPoint } from "@/lib/analytics/types";
import { formatChartDate, niceCeil, useMeasuredWidth } from "./chart-utils";

interface FlowChartProps {
  data: FlowPoint[];
  createdTotal: number;
  completedTotal: number;
}

const HEIGHT = 300;
const MARGIN = { top: 16, right: 20, bottom: 28, left: 36 };
const CREATED_COLOR = "#6366f1"; // indigo — work coming in
const COMPLETED_COLOR = "#10b981"; // emerald — work finished

export function FlowChart({ data, createdTotal, completedTotal }: FlowChartProps) {
  const [containerRef, width] = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);

  // Cumulative running totals across the range; the gap between the two lines
  // is net open work added (or burned off) during the window.
  const cumulative = useMemo(() => {
    const out: { date: string; created: number; completed: number }[] = [];
    let created = 0;
    let completed = 0;
    for (const p of data) {
      created += p.created;
      completed += p.completed;
      out.push({ date: p.date, created, completed });
    }
    return out;
  }, [data]);

  const geom = useMemo(() => {
    const plotLeft = MARGIN.left;
    const plotRight = width - MARGIN.right;
    const plotTop = MARGIN.top;
    const plotBottom = HEIGHT - MARGIN.bottom;
    const plotW = Math.max(1, plotRight - plotLeft);
    const plotH = Math.max(1, plotBottom - plotTop);

    const maxValue = Math.max(
      0,
      ...cumulative.map((d) => Math.max(d.created, d.completed)),
    );
    const yMax = niceCeil(maxValue);

    const n = cumulative.length;
    const xFor = (i: number) =>
      n <= 1 ? plotLeft + plotW / 2 : plotLeft + (i / (n - 1)) * plotW;
    const yFor = (v: number) => plotBottom - (v / yMax) * plotH;

    const line = (values: number[]) =>
      values
        .map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`)
        .join(" ");

    const createdLine = line(cumulative.map((d) => d.created));
    const completedLine = line(cumulative.map((d) => d.completed));

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
      label: formatChartDate(cumulative[i].date),
    }));

    return { plotLeft, plotRight, plotTop, plotBottom, plotW, xFor, yFor, createdLine, completedLine, yTicks, xTicks };
  }, [cumulative, width]);

  if (data.length === 0 || (createdTotal === 0 && completedTotal === 0)) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Created vs completed</h2>
        <div className="flex h-[260px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No cards were created or completed in the selected period.
        </div>
      </div>
    );
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xUser = (e.clientX - rect.left) * (width / rect.width);
    if (cumulative.length <= 1) {
      setHover(0);
      return;
    }
    const ratio = (xUser - geom.plotLeft) / geom.plotW;
    const i = Math.round(ratio * (cumulative.length - 1));
    setHover(Math.max(0, Math.min(cumulative.length - 1, i)));
  };

  const hoverPt = hover != null ? cumulative[hover] : null;
  const hoverX = hover != null ? geom.xFor(hover) : 0;
  const tooltipLeftPct = Math.min(94, Math.max(6, (hoverX / width) * 100));

  const net = createdTotal - completedTotal;

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Created vs completed</h2>
          <p className="text-xs text-muted-foreground">
            Cumulative cards created and finished — the gap is net open work.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: CREATED_COLOR }} />
            Created
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: COMPLETED_COLOR }} />
            Completed
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
          {/* Horizontal gridlines + y-axis labels (counts) */}
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
                {t.value}
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

          {/* Completed line */}
          <path
            d={geom.completedLine}
            fill="none"
            stroke={COMPLETED_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Created line */}
          <path
            d={geom.createdLine}
            fill="none"
            stroke={CREATED_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Hover guide + markers */}
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
              <circle cx={hoverX} cy={geom.yFor(hoverPt.created)} r={4} fill={CREATED_COLOR} stroke="var(--card)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <circle cx={hoverX} cy={geom.yFor(hoverPt.completed)} r={4} fill={COMPLETED_COLOR} stroke="var(--card)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
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
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CREATED_COLOR }} />
              Created {hoverPt.created}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COMPLETED_COLOR }} />
              Completed {hoverPt.completed}
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-4 border-t pt-4 text-sm">
        <div>
          <span className="text-muted-foreground">Created</span>
          <div className="font-medium">{createdTotal}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Completed</span>
          <div className="font-medium">{completedTotal}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Net open</span>
          <div className={`font-medium ${net > 0 ? "text-destructive" : net < 0 ? "text-success-foreground" : ""}`}>
            {net > 0 ? "+" : ""}
            {net}
          </div>
        </div>
      </div>
    </div>
  );
}
