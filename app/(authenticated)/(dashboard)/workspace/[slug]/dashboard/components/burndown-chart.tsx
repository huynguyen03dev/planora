"use client";

import type { BurndownPoint } from "@/lib/analytics/types";

interface BurndownChartProps {
  data: BurndownPoint[];
}

export function BurndownChart({ data }: BurndownChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
        No burndown data available for the selected period.
      </div>
    );
  }

  const maxRemaining = Math.max(...data.map((d) => d.remainingHours), 1);
  const chartHeight = 300;
  const padding = 40;

  const xStep = data.length > 1 ? (100 - padding * 2) / (data.length - 1) : 0;

  // Build SVG path for remaining hours
  const remainingPoints = data.map((point, index) => {
    const x = padding + index * xStep;
    const y =
      chartHeight -
      padding -
      (point.remainingHours / maxRemaining) * (chartHeight - padding * 2);
    return `${x},${y}`;
  });

  const remainingPath = `M ${remainingPoints.join(" L ")}`;

  // Build SVG path for ideal line
  const idealPoints = data
    .filter((point) => point.idealHours !== null)
    .map((point, index) => {
      const x = padding + index * xStep;
      const y =
        chartHeight -
        padding -
        ((point.idealHours ?? 0) / maxRemaining) * (chartHeight - padding * 2);
      return `${x},${y}`;
    });

  const idealPath = idealPoints.length > 0 ? `M ${idealPoints.join(" L ")}` : "";

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Burndown Chart</h2>
      <div className="relative h-[300px] w-full">
        <svg
          viewBox={`0 0 100 ${chartHeight}`}
          className="h-full w-full"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1={padding}
              y1={chartHeight - padding - ratio * (chartHeight - padding * 2)}
              x2={100 - padding}
              y2={chartHeight - padding - ratio * (chartHeight - padding * 2)}
              stroke="#e5e7eb"
              strokeWidth="0.2"
            />
          ))}

          {/* Ideal line */}
          {idealPath && (
            <path
              d={idealPath}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
          )}

          {/* Remaining hours line */}
          <path
            d={remainingPath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="0.8"
          />

          {/* Data points */}
          {data.map((point, index) => {
            const x = padding + index * xStep;
            const y =
              chartHeight -
              padding -
              (point.remainingHours / maxRemaining) *
                (chartHeight - padding * 2);
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="1"
                fill="#3b82f6"
              />
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-1 w-4 bg-blue-500" />
          <span>Remaining Hours</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1 w-4 border-t-2 border-dashed border-gray-400" />
          <span>Ideal Burndown</span>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Start:</span>{" "}
          <span className="font-medium">{data[0]?.remainingHours ?? 0}h</span>
        </div>
        <div>
          <span className="text-muted-foreground">End:</span>{" "}
          <span className="font-medium">
            {data[data.length - 1]?.remainingHours ?? 0}h
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Days:</span>{" "}
          <span className="font-medium">{data.length}</span>
        </div>
      </div>
    </div>
  );
}
