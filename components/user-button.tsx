"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { disconnectSocket } from "@/lib/realtime/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarColorClass } from "@/lib/avatar";

export type WorkspaceRef = {
  id: string;
  name: string;
  slug: string;
};

type UserButtonProps = {
  onCreateWorkspace?: () => void;
  createWorkspaceHref?: string;
  /** The user's workspaces (server-fetched once in the authenticated layout) —
   *  rendered as a quick switcher in the dropdown (U10 round-2). */
  workspaces?: WorkspaceRef[];
};

export function UserButton({
  onCreateWorkspace,
  createWorkspaceHref,
  workspaces = [],
}: UserButtonProps) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const user = session?.user;

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  async function handleSignOut() {
    // Defensive cleanup: close the session-long socket on explicit logout.
    disconnectSocket();
    await signOut({
      fetchOptions: {
        onSuccess() {
          router.push("/sign-in");
        },
      },
    });
  }

  function handleCreateWorkspace() {
    if (onCreateWorkspace) {
      onCreateWorkspace();
      return;
    }

    if (createWorkspaceHref) {
      router.push(createWorkspaceHref);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Avatar className="size-8">
          {user?.image ? (
            <AvatarImage src={user.image} alt={user.name ?? "User"} />
          ) : null}
          <AvatarFallback
            className={`${avatarColorClass(user?.id ?? user?.name ?? "")} text-xs font-medium`}
          >
            {isPending ? null : initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user && (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => router.push("/profile")}>
          Profile
        </DropdownMenuItem>
        {workspaces.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() =>
                  router.push(`/boards?workspace=${workspace.id}`)
                }
              >
                {workspace.name}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        {onCreateWorkspace || createWorkspaceHref ? (
          <DropdownMenuItem onClick={handleCreateWorkspace}>
            Create workspace
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
