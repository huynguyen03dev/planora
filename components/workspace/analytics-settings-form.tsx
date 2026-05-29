"use client";

import { useState, useTransition } from "react";

import {
  updateWorkspaceRequireEstimateAction,
  updateWorkspaceTimezoneAction,
} from "@/app/(authenticated)/(dashboard)/workspace/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AnalyticsSettingsFormProps = {
  workspaceId: string;
  timezone: string;
  requireEstimateBeforeDone: boolean;
};

export function AnalyticsSettingsForm({
  workspaceId,
  timezone,
  requireEstimateBeforeDone,
}: AnalyticsSettingsFormProps) {
  const [draftTimezone, setDraftTimezone] = useState(timezone);
  const [draftRequireEstimate, setDraftRequireEstimate] = useState(
    requireEstimateBeforeDone,
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError("");

    startTransition(async () => {
      const timezoneResult = await updateWorkspaceTimezoneAction(
        workspaceId,
        draftTimezone.trim() || "UTC",
      );
      if (!timezoneResult.success) {
        setError(timezoneResult.error);
        return;
      }

      const requireEstimateResult = await updateWorkspaceRequireEstimateAction(
        workspaceId,
        draftRequireEstimate,
      );
      if (!requireEstimateResult.success) {
        setError(requireEstimateResult.error);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-semibold">Analytics settings</h3>
        <p className="text-sm text-muted-foreground">
          Define workspace-level metric semantics for done transitions.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Timezone</span>
        <Input
          value={draftTimezone}
          onChange={(event) => setDraftTimezone(event.target.value)}
          placeholder="UTC"
          disabled={isPending}
        />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={draftRequireEstimate}
          onChange={(event) => setDraftRequireEstimate(event.target.checked)}
          disabled={isPending}
          className="mt-1"
        />
        <span>
          <span className="block font-medium">Require estimate before done</span>
          <span className="text-muted-foreground">
            Prevent moving unestimated cards from active lists into done lists.
          </span>
        </span>
      </label>

      <Button type="button" size="sm" disabled={isPending} onClick={handleSave}>
        {isPending ? "Saving..." : "Save analytics settings"}
      </Button>
    </div>
  );
}
