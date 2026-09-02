"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cancelInvitationAction } from "@/app/(authenticated)/(dashboard)/workspace/[slug]/members/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

type PendingInvitationRowProps = {
  workspaceId: string;
  invitationId: string;
  email: string;
  role: string;
  expiresAt: Date;
};

export function PendingInvitationRow({
  workspaceId,
  invitationId,
  email,
  role,
  expiresAt,
}: PendingInvitationRowProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    setError("");
    startTransition(async () => {
      const result = await cancelInvitationAction({ workspaceId, invitationId });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{email}</p>
        <p className="text-xs text-muted-foreground">
          Expires {new Date(expiresAt).toLocaleDateString()}
        </p>
      </div>

      <Badge variant="outline">Pending</Badge>
      <Badge variant="secondary">{ROLE_LABEL[role] ?? role}</Badge>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (isPending) return;
          setOpen(next);
          if (!next) setError("");
        }}
      >
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
            disabled={isPending}
          >
            Revoke
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              The invitation to {email} will be canceled. They will no longer be
              able to join with it.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              className={buttonVariants({ variant: "outline" })}
              disabled={isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                handleRevoke();
              }}
              disabled={isPending}
            >
              {isPending ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
