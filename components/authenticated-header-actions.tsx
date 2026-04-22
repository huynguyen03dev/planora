"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { InboxIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CreateWorkspaceModal } from "@/components/boards/create-workspace-modal"
import { UserButton } from "@/components/user-button"

export function AuthenticatedHeaderActions() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isCreateWorkspaceOpen = searchParams.get("createWorkspace") === "1"

  function openCreateWorkspace() {
    const params = new URLSearchParams(searchParams.toString())
    params.set("createWorkspace", "1")
    router.replace(`${pathname}?${params.toString()}`)
  }

  function closeCreateWorkspace() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("createWorkspace")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  const isInvitationsActive = pathname === "/invitations"

  return (
    <>
      <Link
        href="/invitations"
        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
          isInvitationsActive ? "bg-accent font-medium" : "text-muted-foreground"
        }`}
      >
        <HugeiconsIcon icon={InboxIcon} className="size-4" />
        <span>Invitations</span>
      </Link>
      <UserButton onCreateWorkspace={openCreateWorkspace} />
      <CreateWorkspaceModal open={isCreateWorkspaceOpen} onClose={closeCreateWorkspace} />
    </>
  )
}
