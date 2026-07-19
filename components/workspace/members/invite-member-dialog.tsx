"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { inviteMemberAction } from "@/app/(authenticated)/(dashboard)/workspace/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type InviteMemberDialogProps = {
  workspaceId: string;
};

type InvitableRole = "admin" | "editor" | "viewer";

const ROLE_OPTIONS: { value: InvitableRole; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full control, incl. members" },
  { value: "editor", label: "Editor", hint: "Create and edit content" },
  { value: "viewer", label: "Viewer", hint: "Read-only, can comment" },
];

export function InviteMemberDialog({ workspaceId }: InviteMemberDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("editor");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function resetState() {
    setEmail("");
    setRole("editor");
    setError("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData();
    formData.set("workspaceId", workspaceId);
    formData.set("email", email);
    formData.set("role", role);

    startTransition(async () => {
      const result = await inviteMemberAction(formData);

      if (!result.success) {
        setError(result.error);
        return;
      }

      resetState();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) {
          return;
        }
        setOpen(next);
        if (!next) {
          resetState();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <HugeiconsIcon icon={UserAdd01Icon} className="size-4" aria-hidden={true} />
          Invite
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to workspace</DialogTitle>
          <DialogDescription>
            They&apos;ll get an email invitation to join this workspace.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              placeholder="member@example.com"
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              autoFocus
              disabled={isPending}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => {
                setRole(value as InvitableRole);
                setError("");
              }}
              disabled={isPending}
            >
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="font-medium">{option.label}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {option.hint}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={email.trim().length === 0 || isPending}>
              {isPending ? "Sending..." : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
