"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { CreateWorkspaceModal } from "@/components/boards/create-workspace-modal"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { NotificationDropdown } from "@/components/notifications/notification-dropdown"
import { QuickCapture } from "@/components/quick-capture/quick-capture"
import { ThemeToggle } from "@/components/theme-toggle"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { UserButton } from "@/components/user-button"
import { computeInboxBadgeCount } from "@/lib/notifications/inbox"
import { initSocket } from "@/lib/realtime/client"

import { getInboxBadgeCountsAction } from "@/app/(authenticated)/actions"

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
  // activity notifications bump the unread portion of the badge; a live
  // workspace invitation (US-083 W2) bumps the invitation portion.
  useEffect(() => {
    const socket = initSocket()

    function handleNotificationNew() {
      setUnreadCount((prev) => prev + 1)
    }

    function handleInvitationNew() {
      setInvitationCount((prev) => prev + 1)
    }

    // On (re)connect, resync the authoritative badge counts (US-062 mn8 +
    // US-083 W2): `notification:new` / `invitation:new` events fired while the
    // socket was down are never replayed, so increment-only counters drift low
    // until a full nav. Also runs on the initial connect, which is harmless
    // (matches the SSR values). Both halves ride one action so they resync
    // atomically in a single route re-render.
    function handleConnect() {
      getInboxBadgeCountsAction()
        .then((counts) => {
          setUnreadCount(counts.unread)
          setInvitationCount(counts.invitations)
        })
        .catch(() => {
          // Best-effort resync; leave the current counts on failure.
        })
    }

    socket.on("notification:new", handleNotificationNew)
    socket.on("invitation:new", handleInvitationNew)
    socket.on("connect", handleConnect)

    return () => {
      socket.off("notification:new", handleNotificationNew)
      socket.off("invitation:new", handleInvitationNew)
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
      <QuickCapture />
      <ThemeToggle />
      <Popover open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
        <PopoverTrigger asChild>
          <NotificationBell count={badgeCount} isOpen={isNotificationsOpen} />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0 flex flex-col gap-0 border bg-popover shadow-lg">
          <NotificationDropdown
            isOpen={isNotificationsOpen}
            onClose={() => setIsNotificationsOpen(false)}
            onMarkOneRead={() => setUnreadCount((c) => Math.max(0, c - 1))}
            onMarkAllRead={() => setUnreadCount(0)}
            onInvitationCountChange={(count) => setInvitationCount(Math.max(0, count))}
          />
        </PopoverContent>
      </Popover>
      <UserButton onCreateWorkspace={openCreateWorkspace} />
      <CreateWorkspaceModal open={searchParams.get("createWorkspace") === "1"} onClose={closeCreateWorkspace} />
    </div>
  )
}
