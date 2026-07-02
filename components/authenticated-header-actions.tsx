"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { CreateWorkspaceModal } from "@/components/boards/create-workspace-modal"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { NotificationDropdown } from "@/components/notifications/notification-dropdown"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserButton } from "@/components/user-button"
import { computeInboxBadgeCount } from "@/lib/notifications/inbox"
import { initSocket } from "@/lib/realtime/client"

import { getUnreadNotificationCountAction } from "@/app/(authenticated)/actions"

type AuthenticatedHeaderActionsProps = {
  initialUnreadCount: number
  initialInvitationCount: number
}

export function AuthenticatedHeaderActions({
  initialUnreadCount,
  initialInvitationCount,
}: AuthenticatedHeaderActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [invitationCount, setInvitationCount] = useState(initialInvitationCount)

  useEffect(() => {
    setUnreadCount(initialUnreadCount)
  }, [initialUnreadCount])

  useEffect(() => {
    setInvitationCount(initialInvitationCount)
  }, [initialInvitationCount])

  // The socket is owned by SocketLifecycleProvider and lives for the whole
  // authenticated session, so subscribing once on mount is sufficient. New
  // activity notifications bump the unread portion of the badge.
  useEffect(() => {
    const socket = initSocket()

    function handleNotificationNew() {
      setUnreadCount((prev) => prev + 1)
    }

    // On (re)connect, resync the authoritative unread count (US-062 mn8):
    // `notification:new` events fired while the socket was down are never
    // replayed, so an increment-only counter drifts low until a full nav. Also
    // runs on the initial connect, which is harmless (matches the SSR value).
    function handleConnect() {
      getUnreadNotificationCountAction()
        .then((count) => setUnreadCount(count))
        .catch(() => {
          // Best-effort resync; leave the current count on failure.
        })
    }

    socket.on("notification:new", handleNotificationNew)
    socket.on("connect", handleConnect)

    return () => {
      socket.off("notification:new", handleNotificationNew)
      socket.off("connect", handleConnect)
    }
  }, [])

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

  const badgeCount = computeInboxBadgeCount(unreadCount, invitationCount)

  return (
    <div className="flex items-center gap-1">
      <ThemeToggle />
      <div className="relative">
        <NotificationBell
          count={badgeCount}
          onClick={() => setIsNotificationsOpen((prev) => !prev)}
          isOpen={isNotificationsOpen}
        />
        <NotificationDropdown
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          onMarkOneRead={() => setUnreadCount((c) => Math.max(0, c - 1))}
          onMarkAllRead={() => setUnreadCount(0)}
          onInvitationCountChange={(count) => setInvitationCount(Math.max(0, count))}
        />
      </div>
      <UserButton onCreateWorkspace={openCreateWorkspace} />
      <CreateWorkspaceModal open={searchParams.get("createWorkspace") === "1"} onClose={closeCreateWorkspace} />
    </div>
  )
}
