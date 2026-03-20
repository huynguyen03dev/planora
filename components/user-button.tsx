"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserButtonProps = {
  onCreateWorkspace?: () => void;
  createWorkspaceHref?: string;
};

export function UserButton({
  onCreateWorkspace,
  createWorkspaceHref,
}: UserButtonProps) {
  const router = useRouter();
  const { data: session } = useSession();
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
      <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground outline-none ring-offset-background transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        {initials}
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
