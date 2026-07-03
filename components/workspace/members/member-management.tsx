"use client";

import { useEffect, useMemo, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Input } from "@/components/ui/input";
import type { ManagedWorkspaceMember } from "@/lib/workspace-members";

import { InviteMemberDialog } from "./invite-member-dialog";
import { MemberRow } from "./member-row";
import { PendingInvitationRow } from "./pending-invitation-row";

type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
};

type MemberManagementProps = {
  workspaceId: string;
  currentUserId: string;
  canManage: boolean;
  members: ManagedWorkspaceMember[];
  pendingInvitations: PendingInvitation[];
};

export function MemberManagement({
  workspaceId,
  currentUserId,
  canManage,
  members,
  pendingInvitations,
}: MemberManagementProps) {
  const [filter, setFilter] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeoutId = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle.length === 0) {
      return members;
    }
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(needle) ||
        member.email.toLowerCase().includes(needle),
    );
  }, [filter, members]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? "member" : "members"}
            {canManage ? " · manage who can access this workspace" : ""}
          </p>
        </div>
        {canManage ? <InviteMemberDialog workspaceId={workspaceId} /> : null}
      </header>

      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name or email"
          className="pl-9"
          aria-label="Filter members"
        />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="divide-y">
          {filtered.length > 0 ? (
            filtered.map((member) => (
              <MemberRow
                key={member.memberId}
                workspaceId={workspaceId}
                member={member}
                canManage={canManage}
                isSelf={member.userId === currentUserId}
                onError={setToast}
              />
            ))
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No members match &quot;{filter}&quot;.
            </p>
          )}
        </div>
      </section>

      {canManage && pendingInvitations.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Pending invitations ({pendingInvitations.length})
          </h2>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="divide-y">
              {pendingInvitations.map((invitation) => (
                <PendingInvitationRow
                  key={invitation.id}
                  workspaceId={workspaceId}
                  invitationId={invitation.id}
                  email={invitation.email}
                  role={invitation.role}
                  expiresAt={invitation.expiresAt}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed right-4 top-4 z-[60] rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-md"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}
