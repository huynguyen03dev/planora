"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArchiveIcon, ArrowTurnBackwardIcon, Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  restoreCardAction,
  restoreListAction,
  permanentlyDeleteListAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions"
import { boardHeaderControlClass } from "@/components/boards/board-header-controls"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

export type ArchivedCardData = {
  id: string
  title: string
  listTitle: string
}

export type ArchivedListData = {
  id: string
  title: string
  cardCount: number
  /** Number of live (non-archived, non-deleted) cards in this list. */
  liveCardCount?: number
  /** Server-side check result: true if any card in this list has a
   *  Cloudinary-backed attachment that blocks permanent deletion. */
  cloudinaryBlocked?: boolean
}

type ArchivedCardsDialogProps = {
  archivedCards: ArchivedCardData[]
  archivedLists?: ArchivedListData[]
  // Only users who can archive cards/lists (editor/admin) see/restore.
  canRestore: boolean
  // Admin-only permanent delete affordance (Slice C).
  canPermanentDelete?: boolean
}

// Board-header control: lists the board's archived cards and restores them.
// Data is loaded server-side in page.tsx and refreshed via router.refresh()
// after each restore (no store coupling — the row leaves the list on success).
export function ArchivedCardsDialog({
  archivedCards,
  archivedLists = [],
  canRestore,
  canPermanentDelete = false,
}: ArchivedCardsDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"cards" | "lists">("cards")
  const [error, setError] = useState("")
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoringListId, setRestoringListId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Permanent delete state
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    title: string
    cardCount: number
    liveCardCount: number
    cloudinaryBlocked: boolean
  } | null>(null)
  const [confirmText, setConfirmText] = useState("")
  const [forceDelete, setForceDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  if (!canRestore) {
    return null
  }

  const cardCount = archivedCards.length
  const listCount = archivedLists.length
  const totalCount = cardCount + listCount

  function restore(cardId: string) {
    if (isPending) {
      return
    }
    setError("")
    setRestoringId(cardId)
    const formData = new FormData()
    formData.set("cardId", cardId)
    startTransition(async () => {
      const result = await restoreCardAction(formData)
      setRestoringId(null)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function restoreListItem(listId: string) {
    if (isPending) {
      return
    }
    setError("")
    setRestoringListId(listId)
    const formData = new FormData()
    formData.set("listId", listId)
    startTransition(async () => {
      const result = await restoreListAction(formData)
      setRestoringListId(null)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function openDeleteDialog(
    id: string,
    title: string,
    listCardCount: number,
    cloudinaryBlocked: boolean,
    liveCardCount: number,
  ) {
    setError("")
    setConfirmText("")
    setForceDelete(false)
    setDeleteTarget({ id, title, cardCount: listCardCount, cloudinaryBlocked, liveCardCount })
  }

  // Prevent Radix auto-close during async submit. Close only on success/cancel.
  function closeDeleteDialog() {
    setDeleteTarget(null)
    setConfirmText("")
    setForceDelete(false)
    setIsDeleting(false)
  }

  function handleAlertDialogOpenChange(open: boolean) {
    if (!open && !isDeleting) {
      closeDeleteDialog()
    }
  }

  async function confirmPermanentDelete() {
    if (!deleteTarget || isDeleting) {
      return
    }

    setIsDeleting(true)
    setError("")

    const formData = new FormData()
    formData.set("listId", deleteTarget.id)
    formData.set("confirmationText", confirmText)
    formData.set("force", forceDelete ? "true" : "false")

    try {
      const result = await permanentlyDeleteListAction(formData)
      if (!result.success) {
        setError(result.error)
        setIsDeleting(false)
        return
      }
      closeDeleteDialog()
      router.refresh()
    } catch {
      setError("Failed to permanently delete list. Please try again.")
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1.5", boardHeaderControlClass)}
            aria-label="View archived items"
          >
            <HugeiconsIcon icon={ArchiveIcon} size={16} />
            Archived
            {totalCount > 0 ? (
              <Badge className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 font-semibold text-[10px] bg-primary text-primary-foreground hover:bg-primary">
                {totalCount}
              </Badge>
            ) : null}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archived items</DialogTitle>
            <DialogDescription>
              Restore lists or cards to return them to the board.
            </DialogDescription>
          </DialogHeader>

          <div className="flex border-b border-border" role="tablist" aria-label="Archived items tabs">
            <button
              id="archived-cards-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "cards"}
              aria-controls="archived-cards-panel"
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === "cards"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveTab("cards")}
            >
              Cards ({cardCount})
            </button>
            <button
              id="archived-lists-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "lists"}
              aria-controls="archived-lists-panel"
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === "lists"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveTab("lists")}
            >
              Lists ({listCount})
            </button>
          </div>

          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

          {activeTab === "cards" ? (
            <div id="archived-cards-panel" role="tabpanel" aria-labelledby="archived-cards-tab">
              {cardCount === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No archived cards.
                </p>
              ) : (
                <ScrollArea className="max-h-80">
                  <ul className="space-y-1 pr-3">
                    {archivedCards.map((card) => (
                      <li
                        key={card.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-background p-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{card.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            in {card.listTitle}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="shrink-0 gap-1.5"
                          disabled={isPending}
                          onClick={() => restore(card.id)}
                        >
                          <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={14} />
                          {restoringId === card.id ? "Restoring…" : "Restore"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>
          ) : (
            <div id="archived-lists-panel" role="tabpanel" aria-labelledby="archived-lists-tab">
              {listCount === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No archived lists.
                </p>
              ) : (
                <ScrollArea className="max-h-80">
                  <ul className="space-y-1 pr-3">
                    {archivedLists.map((list) => (
                      <li
                        key={list.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-background p-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{list.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {list.cardCount === 1 ? "1 card" : `${list.cardCount} cards`}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="gap-1.5"
                            disabled={isPending}
                            onClick={() => restoreListItem(list.id)}
                          >
                            <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={14} />
                            {restoringListId === list.id ? "Restoring…" : "Restore"}
                          </Button>
                          {canPermanentDelete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-destructive hover:text-destructive"
                              aria-label={`Delete ${list.title} permanently`}
                              disabled={isPending || isDeleting}
                              onClick={() =>
                                openDeleteDialog(
                                  list.id,
                                  list.title,
                                  list.cardCount,
                                  list.cloudinaryBlocked ?? false,
                                  list.liveCardCount ?? 0,
                                )
                              }
                            >
                              <HugeiconsIcon icon={Delete02Icon} size={14} />
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation dialog — keep open during async submit
          (prevent Radix auto-close), close only on success or cancel. */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={handleAlertDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            {deleteTarget?.cloudinaryBlocked ? (
              <>
                <AlertDialogTitle>Cannot permanently delete</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block">
                    This archived list contains attachments stored in Cloudinary.
                    Permanent deletion is blocked to prevent orphaning those files.
                  </span>
                  <span className="block mt-2 text-muted-foreground">
                    Contact your workspace admin to resolve this before proceeding.
                  </span>
                </AlertDialogDescription>
              </>
            ) : (
              <>
                <AlertDialogTitle>Permanently delete &quot;{deleteTarget?.title}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block font-semibold text-destructive">
                    This action cannot be undone.
                  </span>
                  <span className="block mt-1">
                    {deleteTarget && deleteTarget.cardCount > 0
                      ? `The list "${deleteTarget.title}" and all ${deleteTarget.cardCount} card${deleteTarget.cardCount === 1 ? "" : "s"} in it will be permanently deleted.`
                      : `The list "${deleteTarget?.title}" will be permanently deleted.`}
                  </span>
                </AlertDialogDescription>
                <div className="px-6 pb-4">
                  <p className="mb-2 text-sm font-medium">
                    Type <strong>{deleteTarget?.title}</strong> to confirm:
                  </p>
                  <Input
                    placeholder="Type the list title to confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="w-full"
                    aria-label="Type the list title to confirm permanent deletion"
                  />
                  {deleteTarget && deleteTarget.liveCardCount > 0 ? (
                    <div className="mt-3 flex items-start gap-2">
                      <Checkbox
                        id="force-delete"
                        className="mt-0.5"
                        checked={forceDelete}
                        onCheckedChange={(checked) => setForceDelete(checked === true)}
                      />
                      <Label htmlFor="force-delete" className="text-sm cursor-pointer">
                        <span className="font-medium">Also delete active cards</span>
                        <span className="block text-muted-foreground">
                          {deleteTarget.liveCardCount} live card{deleteTarget.liveCardCount === 1 ? "" : "s"} in this list
                          are not archived or soft-deleted. Check this to include them.
                        </span>
                      </Label>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteDialog}>
              {deleteTarget?.cloudinaryBlocked ? "Close" : "Cancel"}
            </AlertDialogCancel>
            {!deleteTarget?.cloudinaryBlocked ? (
              // Use a plain Button, not AlertDialogAction, so Radix does not
              // auto-close the dialog during async submit (US-074 Slice C).
              // Close is controlled by closeDeleteDialog on success/cancel.
              <Button
                type="button"
                variant="destructive"
                disabled={
                  isDeleting ||
                  confirmText !== deleteTarget?.title
                }
                onClick={confirmPermanentDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Deleting…" : "Permanently delete"}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
