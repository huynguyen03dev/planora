"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Crown02Icon,
  Logout01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  leaveWorkspaceAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/app/(authenticated)/(dashboard)/workspace/[slug]/members/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ManagedWorkspaceMember } from "@/lib/workspace-members";

type MemberRowProps = {
  workspaceId: string;
  member: ManagedWorkspaceMember;
  canManage: boolean;
  isSelf: boolean;
  onError: (message: string) => void;
};

type WorkspaceRole = "admin" | "editor" | "viewer";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}

export function MemberRow({
  workspaceId,
  member,
  canManage,
  isSelf,
  onError,
}: MemberRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [dialogError, setDialogError] = useState("");

  const isAdmin = member.role === "admin";

  function handleRoleChange(nextRole: WorkspaceRole) {
    if (nextRole === member.role) {
      return;
    }

    startTransition(async () => {
      const result = await updateMemberRoleAction({
        workspaceId,
        targetUserId: member.userId,
        role: nextRole,
      });

      if (!result.success) {
        onError(result.error);
        return;
      }

      router.refresh();
    });
  }

  function handleRemove() {
    setDialogError("");
    startTransition(async () => {
      const result = await removeMemberAction({
        workspaceId,
        targetUserId: member.userId,
      });

      if (!result.success) {
        setDialogError(result.error);
        return;
      }

      setRemoveOpen(false);
      router.refresh();
    });
  }

  function handleLeave() {
    setDialogError("");
    startTransition(async () => {
      const result = await leaveWorkspaceAction({ workspaceId });

      if (!result.success) {
        setDialogError(result.error);
        return;
      }

      setLeaveOpen(false);
      router.push(result.redirectTo);
      router.refresh();
    });
  }

  const showMenu = isSelf || (canManage && !isSelf);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar className="size-9">
        {member.image ? <AvatarImage src={member.image} alt="" /> : null}
        <AvatarFallback>{initials(member.name)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {member.name}
          {isSelf ? (
            <span className="text-xs font-normal text-muted-foreground">(you)</span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>

      {canManage ? (
        <Select
          value={member.role}
          onValueChange={(value) => handleRoleChange(value as WorkspaceRole)}
          disabled={isPending}
        >
          <SelectTrigger size="sm" className="w-28" aria-label={`Role for ${member.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Badge variant={isAdmin ? "default" : "secondary"} className="gap-1">
          {isAdmin ? <HugeiconsIcon icon={Crown02Icon} className="size-3" /> : null}
          {ROLE_LABEL[member.role] ?? member.role}
        </Badge>
      )}

      {showMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Actions for ${member.name}`}
              disabled={isPending}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isSelf ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setDialogError("");
                  setLeaveOpen(true);
                }}
              >
                <HugeiconsIcon icon={Logout01Icon} className="size-4" />
                Leave workspace
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  setDialogError("");
                  setRemoveOpen(true);
                }}
              >
                Remove from workspace
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        // Keep row alignment when there is no menu (a non-manager viewing peers).
        <div className="size-8 shrink-0" />
      )}

      {/* Remove another member — extra caution when the target is an admin (R4). */}
      <AlertDialog
        open={removeOpen}
        onOpenChange={(next) => {
          if (isPending) return;
          setRemoveOpen(next);
          if (!next) setDialogError("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isAdmin
                ? "This member is an admin. They will lose all access to this workspace and its boards."
                : "They will lose access to this workspace and its boards."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {dialogError ? (
            <p className="text-sm text-destructive">{dialogError}</p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              className={buttonVariants({ variant: "outline" })}
              disabled={isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={(event) => {
                event.preventDefault();
                handleRemove();
              }}
              disabled={isPending}
            >
              {isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave (self). */}
      <AlertDialog
        open={leaveOpen}
        onOpenChange={(next) => {
          if (isPending) return;
          setLeaveOpen(next);
          if (!next) setDialogError("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to this workspace and its boards. An admin will
              need to re-invite you to rejoin.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {dialogError ? (
            <p className="text-sm text-destructive">{dialogError}</p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              className={buttonVariants({ variant: "outline" })}
              disabled={isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={(event) => {
                event.preventDefault();
                handleLeave();
              }}
              disabled={isPending}
            >
              {isPending ? "Leaving..." : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
