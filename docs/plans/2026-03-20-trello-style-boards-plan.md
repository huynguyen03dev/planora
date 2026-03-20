# Trello-Style Boards Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace current `/boards` placeholder with Trello-style sidebar navigation and workspace/board views.

**Architecture:** Server Components for data fetching, Client Components for interactive sidebar. Query param `?workspace=[id]` controls view. Reuse existing Better Auth organization APIs via `lib/workspace.ts`.

**Tech Stack:** Next.js 16 (App Router), React 19, shadcn/ui, Tailwind CSS 4, Better Auth organization plugin, Prisma.

**Spec:** `docs/plans/2026-03-20-trello-style-boards-design.md`

---

## File Structure

### New Files
| Path | Responsibility |
|------|----------------|
| `components/boards/boards-sidebar.tsx` | Sidebar with top Boards link + workspace list |
| `components/boards/workspace-item.tsx` | Collapsible workspace row in sidebar |
| `components/boards/boards-overview.tsx` | Main content: all workspaces with boards |
| `components/boards/workspace-boards-view.tsx` | Main content: single workspace's boards |
| `components/boards/workspace-section.tsx` | Workspace header + board grid (used in overview) |
| `components/boards/board-card.tsx` | Individual board thumbnail |
| `components/boards/empty-boards-state.tsx` | Centered CTA for no-workspace users |
| `components/boards/create-workspace-modal.tsx` | Modal dialog for workspace creation |
| `components/boards/error-state.tsx` | Error display with retry button |
| `app/(authenticated)/(dashboard)/boards/actions.ts` | Server action for workspace creation |
| `app/(authenticated)/(dashboard)/boards/boards-page-client.tsx` | Client component with sidebar + main content |
| `app/(authenticated)/(dashboard)/boards/boards-page-wrapper.tsx` | Client wrapper managing modal state |
| `app/(authenticated)/(dashboard)/boards/[boardId]/page.tsx` | Placeholder board detail page |
| `app/(authenticated)/(dashboard)/boards/error.tsx` | Error boundary for workspace/board fetch errors |
| `app/(authenticated)/(dashboard)/profile/page.tsx` | Placeholder profile page |

### Modified Files
| Path | Changes |
|------|---------|
| `app/(authenticated)/layout.tsx` | Remove UserButton (now rendered by page) |
| `components/user-button.tsx` | Add "Create Workspace" and "Profile" menu items |
| `app/(authenticated)/(dashboard)/layout.tsx` | Remove sidebar, pass children only |
| `app/(authenticated)/(dashboard)/boards/page.tsx` | Complete rewrite with new components |
| `app/(authenticated)/(dashboard)/workspace/page.tsx` | Rewrite as redirect to /boards |
| `lib/workspace.ts` | Add `listBoardsByWorkspaceIds` helper |

### Removed Files
| Path | Reason |
|------|--------|
| `app/(authenticated)/(dashboard)/workspace/actions.ts` | Logic moved to boards/actions.ts |

---

## Task 1: Board Card Component

**Files:**
- Create: `components/boards/board-card.tsx`

- [ ] **Step 1: Create BoardCard component**

```tsx
import Link from "next/link";

type BoardCardProps = {
  id: string;
  title: string;
  backgroundColor?: string | null;
};

export function BoardCard({ id, title, backgroundColor }: BoardCardProps) {
  const bg = backgroundColor || "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";

  return (
    <Link
      href={`/boards/${id}`}
      className="block h-24 w-44 rounded-lg p-3 transition-opacity hover:opacity-90"
      style={{ background: bg }}
    >
      <span className="font-medium text-white">{title}</span>
    </Link>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/boards/board-card.tsx
git commit -m "feat(boards): add BoardCard component"
```

---

## Task 2: Workspace Section Component

**Files:**
- Create: `components/boards/workspace-section.tsx`

- [ ] **Step 1: Create WorkspaceSection component**

```tsx
import { BoardCard } from "./board-card";

type Board = {
  id: string;
  title: string;
  backgroundColor?: string | null;
};

type WorkspaceSectionProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  boards: Board[];
};

export function WorkspaceSection({ workspace, boards }: WorkspaceSectionProps) {
  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-purple-600 text-sm font-bold text-white">
          {initial}
        </div>
        <span className="font-medium">{workspace.name}</span>
      </div>

      <div className="flex flex-wrap gap-4">
        {boards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No boards yet</p>
        ) : (
          boards.map((board) => (
            <BoardCard
              key={board.id}
              id={board.id}
              title={board.title}
              backgroundColor={board.backgroundColor}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/boards/workspace-section.tsx
git commit -m "feat(boards): add WorkspaceSection component"
```

---

## Task 3: Error State Component

**Files:**
- Create: `components/boards/error-state.tsx`

- [ ] **Step 1: Create ErrorState component**

```tsx
"use client";

type ErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <span className="text-xl text-destructive">!</span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{message}</p>
        <button
          onClick={onRetry}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/boards/error-state.tsx
git commit -m "feat(boards): add ErrorState component"
```

---

## Task 4: Empty Boards State Component

**Files:**
- Create: `components/boards/empty-boards-state.tsx`

- [ ] **Step 1: Create EmptyBoardsState component**

```tsx
"use client";

type EmptyBoardsStateProps = {
  onCreateWorkspace: () => void;
};

export function EmptyBoardsState({ onCreateWorkspace }: EmptyBoardsStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-xl bg-muted">
          <span className="text-3xl">📋</span>
        </div>
        <h2 className="mb-2 text-xl font-semibold">Create your first workspace</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Workspaces help you organize boards for different teams or projects.
        </p>
        <button
          onClick={onCreateWorkspace}
          className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Create workspace
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/boards/empty-boards-state.tsx
git commit -m "feat(boards): add EmptyBoardsState component"
```

---

## Task 5: Create Workspace Server Action

**Files:**
- Create: `app/(authenticated)/(dashboard)/boards/actions.ts`

- [ ] **Step 1: Create server action**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/dal";
import { createWorkspaceForCurrentUser } from "@/lib/workspace";

export async function createWorkspaceAction(
  formData: FormData,
): Promise<{ success: true; workspaceId: string } | { success: false; error: string }> {
  await verifySession();

  const nameValue = formData.get("workspaceName");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";

  if (name.length < 2) {
    return { success: false, error: "Workspace name must be at least 2 characters" };
  }

  if (name.length > 64) {
    return { success: false, error: "Workspace name must be 64 characters or less" };
  }

  try {
    const workspace = await createWorkspaceForCurrentUser(name);
    revalidatePath("/boards");
    return { success: true, workspaceId: workspace.id };
  } catch {
    return { success: false, error: "Failed to create workspace. Please try again." };
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "app/(authenticated)/(dashboard)/boards/actions.ts"
git commit -m "feat(boards): add createWorkspaceAction"
```

---

## Task 6: Create Workspace Modal Component

**Files:**
- Create: `components/boards/create-workspace-modal.tsx`

- [ ] **Step 1: Create modal component**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createWorkspaceAction } from "@/app/(authenticated)/(dashboard)/boards/actions";

type CreateWorkspaceModalProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateWorkspaceModal({ open, onClose }: CreateWorkspaceModalProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function handleSubmit(formData: FormData) {
    const name = (formData.get("workspaceName") as string)?.trim() ?? "";
    
    // Inline field validation
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

    setError("");
    setFieldError("");
    startTransition(async () => {
      const result = await createWorkspaceAction(formData);
      if (result.success) {
        onClose();
        router.push(`/boards?workspace=${result.workspaceId}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Create workspace</h2>

        <form action={handleSubmit}>
          <div className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-2">
              <Label htmlFor="workspaceName">Workspace name</Label>
              <Input
                id="workspaceName"
                name="workspaceName"
                placeholder="Product Team"
                autoFocus
                onChange={() => setFieldError("")}
              />
              {fieldError && (
                <p className="text-sm text-destructive">{fieldError}</p>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/boards/create-workspace-modal.tsx
git commit -m "feat(boards): add CreateWorkspaceModal component"
```

---

## Task 7: Workspace Item Component (Sidebar)

**Files:**
- Create: `components/boards/workspace-item.tsx`

- [ ] **Step 1: Create WorkspaceItem component**

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type WorkspaceItemProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const searchParams = useSearchParams();
  const selectedWorkspaceId = searchParams.get("workspace");
  const isActive = selectedWorkspaceId === workspace.id;
  
  // Initialize expanded based on URL, update when URL changes
  const [expanded, setExpanded] = useState(isActive);
  
  useEffect(() => {
    if (isActive) {
      setExpanded(true);
    }
  }, [isActive]);

  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent"
      >
        <div className="flex size-6 shrink-0 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white">
          {initial}
        </div>
        <span className="flex-1 truncate text-left">{workspace.name}</span>
        <span className="text-xs text-muted-foreground">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="ml-8 mt-1 space-y-0.5">
          <Link
            href={`/boards?workspace=${workspace.id}`}
            className={`block rounded-md px-2 py-1 text-sm transition-colors hover:bg-sidebar-accent ${
              isActive ? "bg-sidebar-accent font-medium" : "text-muted-foreground"
            }`}
          >
            📋 Boards
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/boards/workspace-item.tsx
git commit -m "feat(boards): add WorkspaceItem sidebar component"
```

---

## Task 8: Boards Sidebar Component

**Files:**
- Create: `components/boards/boards-sidebar.tsx`

- [ ] **Step 1: Create BoardsSidebar component**

```tsx
"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { WorkspaceItem } from "./workspace-item";

type Workspace = {
  id: string;
  name: string;
  slug: string;
};

type BoardsSidebarProps = {
  workspaces: Workspace[];
};

function SidebarContent({ workspaces }: BoardsSidebarProps) {
  const searchParams = useSearchParams();
  const isOverview = !searchParams.get("workspace");

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar p-4">
      <nav className="space-y-1">
        <Link
          href="/boards"
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent ${
            isOverview ? "bg-sidebar-accent font-medium" : ""
          }`}
        >
          <span>📋</span>
          <span>Boards</span>
        </Link>
      </nav>

      <div className="mt-6">
        <h3 className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Workspaces
        </h3>
        <div className="mt-2 space-y-1">
          {workspaces.map((workspace) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

export function BoardsSidebar(props: BoardsSidebarProps) {
  return (
    <Suspense fallback={<aside className="w-64 shrink-0 border-r bg-sidebar" />}>
      <SidebarContent {...props} />
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/boards/boards-sidebar.tsx
git commit -m "feat(boards): add BoardsSidebar component"
```

---

## Task 9: Boards Overview Component

**Files:**
- Create: `components/boards/boards-overview.tsx`

- [ ] **Step 1: Create BoardsOverview component**

```tsx
import { WorkspaceSection } from "./workspace-section";

type Board = {
  id: string;
  title: string;
  backgroundColor?: string | null;
  workspaceId: string;
};

type Workspace = {
  id: string;
  name: string;
  slug: string;
};

type BoardsOverviewProps = {
  workspaces: Workspace[];
  boards: Board[];
};

export function BoardsOverview({ workspaces, boards }: BoardsOverviewProps) {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Your Workspaces</h1>

      {workspaces.map((workspace) => (
        <WorkspaceSection
          key={workspace.id}
          workspace={workspace}
          boards={boards.filter((b) => b.workspaceId === workspace.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/boards/boards-overview.tsx
git commit -m "feat(boards): add BoardsOverview component"
```

---

## Task 10: Workspace Boards View Component

**Files:**
- Create: `components/boards/workspace-boards-view.tsx`

- [ ] **Step 1: Create WorkspaceBoardsView component**

```tsx
import { BoardCard } from "./board-card";

type Board = {
  id: string;
  title: string;
  backgroundColor?: string | null;
};

type WorkspaceBoardsViewProps = {
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  boards: Board[];
};

export function WorkspaceBoardsView({ workspace, boards }: WorkspaceBoardsViewProps) {
  const initial = workspace.name.charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-lg font-bold text-white">
          {initial}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">
            {boards.length} {boards.length === 1 ? "board" : "boards"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {boards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No boards yet</p>
        ) : (
          boards.map((board) => (
            <BoardCard
              key={board.id}
              id={board.id}
              title={board.title}
              backgroundColor={board.backgroundColor}
            />
          ))
        )}

        {/* Disabled create board placeholder */}
        <div
          className="flex h-24 w-44 cursor-not-allowed items-center justify-center rounded-lg border-2 border-dashed border-muted text-sm text-muted-foreground opacity-50"
          title="Coming soon"
        >
          + Create board
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/boards/workspace-boards-view.tsx
git commit -m "feat(boards): add WorkspaceBoardsView component"
```

---

## Task 11: Update Workspace Ordering in lib/workspace.ts

**Files:**
- Modify: `lib/workspace.ts`

- [ ] **Step 1: Update listWorkspaceMembershipsByUserId to order by workspace.createdAt**

Find and update the `listWorkspaceMembershipsByUserId` function. Change the query to include `workspace.createdAt` in the select and sort by it:

```ts
export async function listWorkspaceMembershipsByUserId(
  userId: string,
): Promise<WorkspaceMembership[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
        },
      },
    },
  });

  // Sort by workspace creation date (oldest first)
  memberships.sort((a, b) => 
    a.workspace.createdAt.getTime() - b.workspace.createdAt.getTime()
  );

  return memberships.map((membership) => ({
    workspaceId: membership.organizationId,
    role: membership.role,
    workspace: membership.workspace,
  }));
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/workspace.ts
git commit -m "fix(workspace): order workspaces by workspace.createdAt"
```

---

## Task 12: Add Board Fetching to lib/workspace.ts

**Files:**
- Modify: `lib/workspace.ts`

- [ ] **Step 1: Add listBoardsByWorkspaceIds function**

Add at end of `lib/workspace.ts`:

```ts
export async function listBoardsByWorkspaceIds(
  workspaceIds: string[],
): Promise<{ id: string; title: string; backgroundColor: string | null; workspaceId: string }[]> {
  if (workspaceIds.length === 0) return [];

  const boards = await prisma.board.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      archivedAt: null,
    },
    select: {
      id: true,
      title: true,
      backgroundColor: true,
      workspaceId: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return boards;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/workspace.ts
git commit -m "feat(workspace): add listBoardsByWorkspaceIds helper"
```

---

## Task 13: Update UserButton with Menu Items

**Files:**
- Modify: `components/user-button.tsx`

- [ ] **Step 1: Add props and menu items**

Replace entire file with:

```tsx
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
};

export function UserButton({ onCreateWorkspace }: UserButtonProps) {
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
        {onCreateWorkspace && (
          <DropdownMenuItem onClick={onCreateWorkspace}>
            <span className="mr-2 text-primary">+</span>
            Create Workspace
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/user-button.tsx
git commit -m "feat(user-button): add Create Workspace and Profile menu items"
```

---

## Task 14: Create Placeholder Pages

**Files:**
- Create: `app/(authenticated)/(dashboard)/profile/page.tsx`
- Create: `app/(authenticated)/(dashboard)/boards/[boardId]/page.tsx`

- [ ] **Step 1: Create profile placeholder**

```tsx
export default function ProfilePage() {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-2 text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create board detail placeholder**

```tsx
type Props = {
  params: Promise<{ boardId: string }>;
};

export default async function BoardPage({ params }: Props) {
  const { boardId } = await params;

  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Board</h1>
        <p className="mt-2 text-muted-foreground">
          Board ID: {boardId}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Kanban view coming soon</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(authenticated)/(dashboard)/profile/page.tsx" "app/(authenticated)/(dashboard)/boards/[boardId]/page.tsx"
git commit -m "feat: add placeholder pages for profile and board detail"
```

---

## Task 15: Simplify Dashboard Layout

**Files:**
- Modify: `app/(authenticated)/(dashboard)/layout.tsx`

- [ ] **Step 1: Remove sidebar, keep children only**

Replace entire file with:

```tsx
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(authenticated)/(dashboard)/layout.tsx"
git commit -m "refactor(layout): remove dashboard sidebar (now in boards page)"
```

---

## Task 16: Create Boards Page Client Component

**Files:**
- Create: `app/(authenticated)/(dashboard)/boards/boards-page-client.tsx`

- [ ] **Step 1: Create client component**

```tsx
"use client";

import { BoardsSidebar } from "@/components/boards/boards-sidebar";
import { BoardsOverview } from "@/components/boards/boards-overview";
import { WorkspaceBoardsView } from "@/components/boards/workspace-boards-view";
import { EmptyBoardsState } from "@/components/boards/empty-boards-state";
import { CreateWorkspaceModal } from "@/components/boards/create-workspace-modal";

type Workspace = {
  id: string;
  name: string;
  slug: string;
};

type Board = {
  id: string;
  title: string;
  backgroundColor: string | null;
  workspaceId: string;
};

type BoardsPageClientProps = {
  workspaces: Workspace[];
  boards: Board[];
  selectedWorkspaceId: string | null;
  onCreateWorkspace: () => void;
  modalOpen: boolean;
  onModalClose: () => void;
};

export function BoardsPageClient({
  workspaces,
  boards,
  selectedWorkspaceId,
  onCreateWorkspace,
  modalOpen,
  onModalClose,
}: BoardsPageClientProps) {
  const hasWorkspaces = workspaces.length > 0;
  const selectedWorkspace = selectedWorkspaceId
    ? workspaces.find((w) => w.id === selectedWorkspaceId)
    : null;

  return (
    <>
      {hasWorkspaces ? (
        <div className="flex flex-1">
          <BoardsSidebar workspaces={workspaces} />
          <main className="flex-1 p-6">
            {selectedWorkspace ? (
              <WorkspaceBoardsView
                workspace={selectedWorkspace}
                boards={boards.filter((b) => b.workspaceId === selectedWorkspace.id)}
              />
            ) : (
              <BoardsOverview workspaces={workspaces} boards={boards} />
            )}
          </main>
        </div>
      ) : (
        <EmptyBoardsState onCreateWorkspace={onCreateWorkspace} />
      )}

      <CreateWorkspaceModal open={modalOpen} onClose={onModalClose} />
    </>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "app/(authenticated)/(dashboard)/boards/boards-page-client.tsx"
git commit -m "feat(boards): add BoardsPageClient component"
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "app/(authenticated)/(dashboard)/boards/boards-page-client.tsx"
git commit -m "feat(boards): add BoardsPageClient component"
```

---

## Task 17: Create Boards Page Wrapper

**Files:**
- Create: `app/(authenticated)/(dashboard)/boards/boards-page-wrapper.tsx`

- [ ] **Step 1: Create wrapper with modal state**

```tsx
"use client";

import { useState } from "react";

import { UserButton } from "@/components/user-button";
import { BoardsPageClient } from "./boards-page-client";

type Workspace = {
  id: string;
  name: string;
  slug: string;
};

type Board = {
  id: string;
  title: string;
  backgroundColor: string | null;
  workspaceId: string;
};

type BoardsPageWrapperProps = {
  workspaces: Workspace[];
  boards: Board[];
  selectedWorkspaceId: string | null;
};

export function BoardsPageWrapper({
  workspaces,
  boards,
  selectedWorkspaceId,
}: BoardsPageWrapperProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      {/* Pass callback to navbar UserButton */}
      <div className="fixed right-6 top-3.5 z-10">
        <UserButton onCreateWorkspace={() => setModalOpen(true)} />
      </div>

      <BoardsPageClient
        workspaces={workspaces}
        boards={boards}
        selectedWorkspaceId={selectedWorkspaceId}
        onCreateWorkspace={() => setModalOpen(true)}
        modalOpen={modalOpen}
        onModalClose={() => setModalOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "app/(authenticated)/(dashboard)/boards/boards-page-wrapper.tsx"
git commit -m "feat(boards): add BoardsPageWrapper with modal state"
```

---

## Task 18: Create Error Boundary for Boards Page

**Files:**
- Create: `app/(authenticated)/(dashboard)/boards/error.tsx`

- [ ] **Step 1: Create error boundary**

```tsx
"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/boards/error-state";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function BoardsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Boards page error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <ErrorState
        message="Failed to load your workspaces. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(authenticated)/(dashboard)/boards/error.tsx"
git commit -m "feat(boards): add error boundary for fetch errors"
```

---

## Task 19: Rewrite Boards Page

**Files:**
- Modify: `app/(authenticated)/(dashboard)/boards/page.tsx`

- [ ] **Step 1: Rewrite with data fetching**

Replace entire file with:

```tsx
import { redirect } from "next/navigation";

import { verifySession } from "@/lib/dal";
import { listWorkspaceMembershipsByUserId, listBoardsByWorkspaceIds } from "@/lib/workspace";

import { BoardsPageWrapper } from "./boards-page-wrapper";

type Props = {
  searchParams: Promise<{ workspace?: string }>;
};

export default async function BoardsPage({ searchParams }: Props) {
  const { userId } = await verifySession();
  const params = await searchParams;

  const memberships = await listWorkspaceMembershipsByUserId(userId);
  const workspaces = memberships.map((m) => m.workspace);
  const workspaceIds = workspaces.map((w) => w.id);

  const boards = await listBoardsByWorkspaceIds(workspaceIds);

  // Validate workspace param
  let selectedWorkspaceId: string | null = params.workspace ?? null;
  if (selectedWorkspaceId && !workspaceIds.includes(selectedWorkspaceId)) {
    redirect("/boards");
  }

  return (
    <BoardsPageWrapper
      workspaces={workspaces}
      boards={boards}
      selectedWorkspaceId={selectedWorkspaceId}
    />
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "app/(authenticated)/(dashboard)/boards/page.tsx"
git commit -m "feat(boards): implement Trello-style boards page"
```

---

## Task 20: Update Authenticated Layout

**Files:**
- Modify: `app/(authenticated)/layout.tsx`

- [ ] **Step 1: Remove UserButton from layout (now in BoardsPageWrapper)**

Replace entire file with:

```tsx
import Link from "next/link";

import { verifySession } from "@/lib/dal";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await verifySession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center border-b px-6">
        <Link href="/boards" className="text-lg font-semibold">
          Planora
        </Link>
        {/* UserButton rendered by page with modal state */}
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "app/(authenticated)/layout.tsx"
git commit -m "refactor(layout): move UserButton to page level for modal state"
```

---

## Task 21: Replace Workspace Page with Redirect

**Files:**
- Modify: `app/(authenticated)/(dashboard)/workspace/page.tsx`
- Delete: `app/(authenticated)/(dashboard)/workspace/actions.ts`

- [ ] **Step 1: Replace workspace page with redirect**

Replace entire file with:

```tsx
import { redirect } from "next/navigation";

export default function WorkspacePage() {
  redirect("/boards");
}
```

- [ ] **Step 2: Delete workspace actions**

```bash
rm "app/(authenticated)/(dashboard)/workspace/actions.ts"
```

- [ ] **Step 3: Commit**

```bash
git add "app/(authenticated)/(dashboard)/workspace/"
git commit -m "refactor(workspace): redirect to /boards, remove actions"
```

---

## Task 22: Final Verification

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: No errors (warnings OK)

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Sign in
3. Verify empty state shows "Create your first workspace"
4. Create a workspace via modal
5. Verify sidebar shows workspace
6. Verify workspace view shows "No boards yet"
7. Click top "Boards" to see overview
8. Verify user dropdown has "Create Workspace" option
9. Visit `/workspace` and confirm redirect to `/boards`
10. Visit `/profile` and see "Coming soon"

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(boards): complete Trello-style boards page implementation"
```
