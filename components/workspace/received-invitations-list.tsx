"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  acceptInvitationAction,
  declineInvitationAction,
} from "@/lib/invitation-actions";
import { Button } from "@/components/ui/button";
import type { ReceivedPendingInvitationRecord } from "@/lib/invitation";

type ReceivedInvitationsListProps = {
  invitations: ReceivedPendingInvitationRecord[];
};

export function ReceivedInvitationsList({
  invitations,
}: ReceivedInvitationsListProps) {
  const router = useRouter();
  const [errorByInvitationId, setErrorByInvitationId] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function setInvitationError(invitationId: string, error: string) {
    setErrorByInvitationId((current) => ({
      ...current,
      [invitationId]: error,
    }));
  }

  function clearInvitationError(invitationId: string) {
    setErrorByInvitationId((current) => {
      const next = { ...current };
      delete next[invitationId];
      return next;
    });
  }

  function handleAccept(invitationId: string) {
    clearInvitationError(invitationId);

    const formData = new FormData();
    formData.set("invitationId", invitationId);

    startTransition(async () => {
      const result = await acceptInvitationAction(formData);

      if (!result.success) {
        setInvitationError(invitationId, result.error);
        return;
      }

      router.push(`/boards?workspace=${result.workspaceId}`);
    });
  }

  function handleDecline(invitationId: string) {
    clearInvitationError(invitationId);

    const formData = new FormData();
    formData.set("invitationId", invitationId);

    startTransition(async () => {
      const result = await declineInvitationAction(formData);

      if (!result.success) {
        setInvitationError(invitationId, result.error);
        return;
      }

      router.refresh();
    });
  }

  if (invitations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You have no pending invitations.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {invitations.map((invitation) => (
        <div key={invitation.id} className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{invitation.workspaceName}</p>
              <p className="text-xs text-muted-foreground">
                Role: {invitation.role} · Invited by {invitation.inviterName}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Expires {new Date(invitation.expiresAt).toLocaleDateString()}
            </p>
          </div>

          {errorByInvitationId[invitation.id] ? (
            <p className="text-sm text-destructive">{errorByInvitationId[invitation.id]}</p>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => handleAccept(invitation.id)}
              disabled={isPending}
            >
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleDecline(invitation.id)}
              disabled={isPending}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
