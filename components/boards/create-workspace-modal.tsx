"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createWorkspaceAction } from "@/app/(authenticated)/(dashboard)/boards/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateWorkspaceModalProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateWorkspaceModal({
  open,
  onClose,
}: CreateWorkspaceModalProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    const name = (formData.get("workspaceName") as string | null)?.trim() ?? "";

    if (!name) {
      setFieldError("Workspace name is required");
      return;
    }

    if (name.length < 2) {
      setFieldError("Workspace name must be at least 2 characters");
      return;
    }

    if (name.length > 64) {
      setFieldError("Workspace name must be 64 characters or less");
      return;
    }

    setFieldError("");
    setError("");

    startTransition(async () => {
      const result = await createWorkspaceAction(formData);
      if (result.success) {
        onClose();
        router.push(`/boards?workspace=${result.workspaceId}`);
        return;
      }

      setError(result.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
        </DialogHeader>

        <form action={handleSubmit}>
          <div className="space-y-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="space-y-2">
              <Label htmlFor="workspaceName">Workspace name</Label>
              <Input
                id="workspaceName"
                name="workspaceName"
                placeholder="Product Team"
                autoFocus
                onChange={() => {
                  setFieldError("");
                  setError("");
                }}
              />
              {fieldError ? (
                <p className="text-sm text-destructive">{fieldError}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
