"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { InboxIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CreateWorkspaceModal } from "@/components/boards/create-workspace-modal"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { NotificationDropdown } from "@/components/notifications/notification-dropdown"
import { UserButton } from "@/components/user-button"

type AuthenticatedHeaderActionsProps = {
  initialUnreadCount: number
}

export function AuthenticatedHeaderActions({ initialUnreadCount }: AuthenticatedHeaderActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)

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
    <div className="flex items-center gap-1">
      <Link
        href="/invitations"
        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
          isInvitationsActive ? "bg-accent font-medium" : "text-muted-foreground"
        }`}
      >
        <HugeiconsIcon icon={InboxIcon} className="size-4" />
        <span className="hidden sm:inline">Invitations</span>
      </Link>
      <div className="relative">
        <NotificationBell
          initialUnreadCount={unreadCount}
          onClick={() => setIsNotificationsOpen((prev) => !prev)}
          isOpen={isNotificationsOpen}
        />
        <NotificationDropdown
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          onMarkOneRead={() => setUnreadCount((c) => Math.max(0, c - 1))}
          onMarkAllRead={() => setUnreadCount(0)}
        />
      </div>
      <UserButton onCreateWorkspace={openCreateWorkspace} />
      <CreateWorkspaceModal open={searchParams.get("createWorkspace") === "1"} onClose={closeCreateWorkspace} />
    </div>
  )
}
