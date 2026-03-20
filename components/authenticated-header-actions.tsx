"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

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

  return (
    <>
      <UserButton onCreateWorkspace={openCreateWorkspace} />
      <CreateWorkspaceModal open={isCreateWorkspaceOpen} onClose={closeCreateWorkspace} />
    </>
  )
}
