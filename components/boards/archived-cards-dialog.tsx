"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArchiveIcon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { restoreCardAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions"
import { boardHeaderControlClass } from "@/components/boards/board-header-controls"
import { Button } from "@/components/ui/button"
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

type ArchivedCardsDialogProps = {
  archivedCards: ArchivedCardData[]
  // Only users who can archive cards (editor/admin) see/restore.
  canRestore: boolean
}

// Board-header control: lists the board's archived cards and restores them.
// Data is loaded server-side in page.tsx and refreshed via router.refresh()
// after each restore (no store coupling — the row leaves the list on success).
export function ArchivedCardsDialog({
  archivedCards,
  canRestore,
}: ArchivedCardsDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!canRestore) {
    return null
  }

  const count = archivedCards.length

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1.5", boardHeaderControlClass)}
          aria-label="View archived cards"
        >
          <HugeiconsIcon icon={ArchiveIcon} size={16} />
          Archived
          {count > 0 ? (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {count}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archived cards</DialogTitle>
          <DialogDescription>
            Restore a card to return it to its list.
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {count === 0 ? (
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
      </DialogContent>
    </Dialog>
  )
}
