"use client";

import { useState, useTransition } from "react";

import {
  exportWorkspaceAnalyticsAction,
  generateAnalyticsCSV,
} from "../actions";
import type { AnalyticsFilters } from "@/lib/analytics/types";
import { Button } from "@/components/ui/button";

type SerializableAnalyticsFilters = {
  boardId?: string;
  memberId?: string;
  includeArchivedBoards?: boolean;
  preset?: "7d" | "30d" | "90d";
  from?: string;
  to?: string;
};

type AnalyticsExportButtonsProps = {
  workspaceSlug: string;
  filters: SerializableAnalyticsFilters;
};

function toActionFilters(filters: SerializableAnalyticsFilters): AnalyticsFilters {
  return {
    boardId: filters.boardId,
    memberId: filters.memberId,
    includeArchivedBoards: filters.includeArchivedBoards,
    preset: filters.preset,
    from: filters.from ? new Date(filters.from) : undefined,
    to: filters.to ? new Date(filters.to) : undefined,
  };
}

function downloadFile(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AnalyticsExportButtons({
  workspaceSlug,
  filters,
}: AnalyticsExportButtonsProps) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleExport(format: "json" | "csv") {
    setError("");

    startTransition(async () => {
      const result = await exportWorkspaceAnalyticsAction(
        workspaceSlug,
        toActionFilters(filters),
      );
      if (!result.success) {
        setError(result.error);
        return;
      }

      if (format === "json") {
        downloadFile(
          "workspace-analytics.json",
          JSON.stringify(result.data, null, 2),
          "application/json",
        );
        return;
      }

      const csv = await generateAnalyticsCSV(result.data);
      downloadFile("workspace-analytics.csv", csv, "text/csv");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => handleExport("csv")}
        >
          Export CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => handleExport("json")}
        >
          Export JSON
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
