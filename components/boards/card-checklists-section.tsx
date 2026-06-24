"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createChecklistAction,
  createChecklistItemAction,
  deleteChecklistAction,
  deleteChecklistItemAction,
  toggleChecklistItemAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ChecklistItemData = {
  id: string;
  title: string;
  isCompleted: boolean;
  position: number;
};

export type ChecklistData = {
  id: string;
  title: string;
  position: number;
  items: ChecklistItemData[];
};

type CardChecklistsSectionProps = {
  cardId: string;
  checklists: ChecklistData[];
  canEdit: boolean;
};

export function CardChecklistsSection({
  cardId,
  checklists,
  canEdit,
}: CardChecklistsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [addingChecklist, setAddingChecklist] = useState(false);
  // Per-checklist "add item" draft, keyed by checklist id.
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});

  function run(action: () => Promise<{ success: boolean; error?: string }>, onDone?: () => void) {
    if (isPending) {
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  function addChecklist() {
    const title = newChecklistTitle.trim();
    if (!title) {
      return;
    }
    const formData = new FormData();
    formData.set("cardId", cardId);
    formData.set("title", title);
    run(() => createChecklistAction(formData), () => {
      setNewChecklistTitle("");
      setAddingChecklist(false);
    });
  }

  function addItem(checklistId: string) {
    const title = (itemDrafts[checklistId] ?? "").trim();
    if (!title) {
      return;
    }
    const formData = new FormData();
    formData.set("checklistId", checklistId);
    formData.set("title", title);
    run(() => createChecklistItemAction(formData), () =>
      setItemDrafts((drafts) => ({ ...drafts, [checklistId]: "" })),
    );
  }

  function toggleItem(itemId: string, isCompleted: boolean) {
    const formData = new FormData();
    formData.set("itemId", itemId);
    formData.set("isCompleted", String(!isCompleted));
    run(() => toggleChecklistItemAction(formData));
  }

  function removeItem(itemId: string) {
    const formData = new FormData();
    formData.set("itemId", itemId);
    run(() => deleteChecklistItemAction(formData));
  }

  function removeChecklist(checklistId: string) {
    const formData = new FormData();
    formData.set("checklistId", checklistId);
    run(() => deleteChecklistAction(formData));
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Checklists</h3>
        {canEdit && checklists.length > 0 && !addingChecklist ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => setAddingChecklist(true)}
          >
            Add checklist
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {checklists.length === 0 && !addingChecklist ? (
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">No checklists yet.</p>
        </div>
      ) : null}

      {checklists.map((checklist) => {
        const total = checklist.items.length;
        const done = checklist.items.filter((item) => item.isCompleted).length;
        return (
          <div key={checklist.id} className="space-y-2 rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{checklist.title}</h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {done}/{total}
                </span>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => removeChecklist(checklist.id)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>

            {total > 0 ? (
              <ul className="space-y-1">
                {checklist.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-1">
                    {/* shadcn Checkbox + an htmlFor-linked label, so clicking the
                        item text toggles it too — not just the box. */}
                    <div className="flex flex-1 items-center gap-2 rounded px-1 py-1 hover:bg-muted/60">
                      <Checkbox
                        id={`checklist-item-${item.id}`}
                        checked={item.isCompleted}
                        disabled={!canEdit || isPending}
                        onCheckedChange={() => toggleItem(item.id, item.isCompleted)}
                      />
                      <label
                        htmlFor={`checklist-item-${item.id}`}
                        className={cn(
                          "flex-1 text-sm",
                          canEdit && !isPending ? "cursor-pointer" : "cursor-default",
                          item.isCompleted && "text-muted-foreground line-through",
                        )}
                      >
                        {item.title}
                      </label>
                    </div>
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${item.title}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={isPending}
                        onClick={() => removeItem(item.id)}
                      >
                        ×
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No items yet.</p>
            )}

            {canEdit ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  addItem(checklist.id);
                }}
                className="flex gap-2"
              >
                <Input
                  value={itemDrafts[checklist.id] ?? ""}
                  onChange={(event) =>
                    setItemDrafts((drafts) => ({
                      ...drafts,
                      [checklist.id]: event.target.value,
                    }))
                  }
                  placeholder="Add an item…"
                  disabled={isPending}
                  className="h-9"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || (itemDrafts[checklist.id] ?? "").trim().length === 0}
                >
                  Add
                </Button>
              </form>
            ) : null}
          </div>
        );
      })}

      {canEdit && addingChecklist ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addChecklist();
          }}
          className="space-y-2 rounded-lg border bg-background p-3"
        >
          <Input
            value={newChecklistTitle}
            onChange={(event) => setNewChecklistTitle(event.target.value)}
            placeholder="Checklist title"
            disabled={isPending}
            autoFocus
            className="h-9"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isPending || newChecklistTitle.trim().length === 0}
            >
              Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setNewChecklistTitle("");
                setAddingChecklist(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {canEdit && checklists.length === 0 && !addingChecklist ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setAddingChecklist(true)}
        >
          Add checklist
        </Button>
      ) : null}
    </section>
  );
}
