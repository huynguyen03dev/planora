"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { inviteMemberAction } from "@/app/(authenticated)/(dashboard)/workspace/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InviteMemberFormProps = {
  workspaceId: string;
};

const INVITATION_ROLES = [
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
] as const;

export function InviteMemberForm({ workspaceId }: InviteMemberFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITATION_ROLES)[number]["value"]>("viewer");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();

  const isSubmitDisabled = useMemo(() => {
    return email.trim().length === 0 || isPending;
  }, [email, isPending]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

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

      setEmail("");
      setRole("viewer");
      setSuccess("Invitation sent");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
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
              setSuccess("");
            }}
            disabled={isPending}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as (typeof INVITATION_ROLES)[number]["value"]);
              setError("");
              setSuccess("");
            }}
            disabled={isPending}
          >
            {INVITATION_ROLES.map((invitationRole) => (
              <option key={invitationRole.value} value={invitationRole.value}>
                {invitationRole.label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" disabled={isSubmitDisabled}>
          {isPending ? "Sending..." : "Invite"}
        </Button>
      </div>
    </form>
  );
}
