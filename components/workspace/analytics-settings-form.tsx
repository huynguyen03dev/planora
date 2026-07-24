"use client";

import { useEffect, useState, useTransition } from "react";

import {
  updateWorkspaceRequireEstimateAction,
  updateWorkspaceTimezoneAction,
} from "@/app/(authenticated)/(dashboard)/workspace/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [initialTimezone, setInitialTimezone] = useState(timezone);
  const [initialRequireEstimate, setInitialRequireEstimate] = useState(
    requireEstimateBeforeDone,
  );
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!successMessage) return;
    const timeoutId = window.setTimeout(() => setSuccessMessage(""), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const isDirty =
    draftTimezone !== initialTimezone ||
    draftRequireEstimate !== initialRequireEstimate;

  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!isDirty) return;
    setError("");
    setSuccessMessage("");

    startTransition(async () => {
      const trimmedTimezone = draftTimezone.trim() || "UTC";
      const timezoneResult = await updateWorkspaceTimezoneAction(workspaceId, trimmedTimezone);
      if (!timezoneResult.success) {
        setError(timezoneResult.error);
        return;
      }
      setInitialTimezone(trimmedTimezone);
      setDraftTimezone(trimmedTimezone);

      const requireEstimateResult = await updateWorkspaceRequireEstimateAction(workspaceId, draftRequireEstimate);
      if (!requireEstimateResult.success) {
        setError(requireEstimateResult.error);
        return;
      }
      setInitialRequireEstimate(draftRequireEstimate);

      setSuccessMessage("Analytics settings saved");
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

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {successMessage ? (
        <p className="text-sm text-muted-foreground" role="status">✓ {successMessage}</p>
      ) : null}

      <div className="block space-y-1">
        <Label htmlFor="timezone-input">Timezone</Label>
        <Input
          id="timezone-input"
          value={draftTimezone}
          onChange={(event) => setDraftTimezone(event.target.value)}
          placeholder="UTC"
          disabled={isPending}
        />
      </div>

      <div className="flex items-start gap-2 text-sm">
        <Checkbox
          id="require-estimate"
          checked={draftRequireEstimate}
          onCheckedChange={(checked) => setDraftRequireEstimate(!!checked)}
          disabled={isPending}
          className="mt-1"
        />
        <Label htmlFor="require-estimate" className="flex flex-col gap-0.5 font-normal cursor-pointer select-text">
          <span className="font-medium text-sm text-foreground">Require estimate before done</span>
          <span className="text-xs text-muted-foreground">
            Prevent moving unestimated cards from active lists into done lists.
          </span>
        </Label>
      </div>

      <Button type="button" size="sm" disabled={!isDirty || isPending} onClick={handleSave}>
        {isPending ? "Saving..." : "Save analytics settings"}
      </Button>
    </div>
  );
}
