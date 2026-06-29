"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addCardLabelAction,
  createLabelAction,
  deleteLabelAction,
  removeCardLabelAction,
  updateLabelAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ColorPalette } from "@/components/boards/color-palette";
import { DEFAULT_BOARD_COLOR } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type LabelChip = {
  id: string;
  name: string;
  color: string;
};

type CardLabelsSectionProps = {
  cardId: string;
  boardId: string;
  boardLabels: LabelChip[];
  cardLabelIds: string[];
  canEdit: boolean;
};

export function CardLabelsSection({
  cardId,
  boardId,
  boardLabels,
  cardLabelIds,
  canEdit,
}: CardLabelsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const attachedIds = new Set(cardLabelIds);
  const attached = boardLabels.filter((label) => attachedIds.has(label.id));

  function toggleAttached(labelId: string, isAttached: boolean) {
    if (isPending) {
      return;
    }
    setError("");
    const formData = new FormData();
    formData.set("cardId", cardId);
    formData.set("labelId", labelId);
    startTransition(async () => {
      const result = isAttached
        ? await removeCardLabelAction(formData)
        : await addCardLabelAction(formData);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Labels</h3>
        {canEdit ? (
          <ManageLabelsDialog boardId={boardId} boardLabels={boardLabels} />
        ) : (
          <span className="text-xs text-muted-foreground">
            Visible to all members
          </span>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {attached.length === 0 ? (
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">No labels yet.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {attached.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-white"
              style={{ backgroundColor: label.color }}
            >
              {label.name}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove ${label.name}`}
                  className="text-white/80 hover:text-white disabled:opacity-50"
                  disabled={isPending}
                  onClick={() => toggleAttached(label.id, true)}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}

      {canEdit && boardLabels.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border bg-background p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Attach a label
          </p>
          <ul className="space-y-1.5">
            {boardLabels.map((label) => (
              <li key={label.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm disabled:opacity-50",
                    attachedIds.has(label.id) ? "font-semibold" : "font-normal",
                  )}
                  disabled={isPending}
                  aria-pressed={attachedIds.has(label.id)}
                  onClick={() =>
                    toggleAttached(label.id, attachedIds.has(label.id))
                  }
                >
                  <span
                    className="h-4 w-6 rounded"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1">{label.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {attachedIds.has(label.id) ? "On" : "Off"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

type ManageLabelsDialogProps = {
  boardId: string;
  boardLabels: LabelChip[];
};

// Full board-label administration (rename / recolor / delete / create) lives here
// rather than inline in every card dialog (US-033). The card dialog keeps only
// attach/detach; this surface owns CRUD against the shared board labels.
function ManageLabelsDialog({ boardId, boardLabels }: ManageLabelsDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
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
      setEditingId(null);
      setCreating(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setEditingId(null);
          setCreating(false);
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Manage labels
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage board labels</DialogTitle>
          <DialogDescription>
            Rename, recolor, delete, or create labels for this board. Changes
            apply everywhere this board&apos;s labels are used.
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {boardLabels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No labels on this board yet. Create one below.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {boardLabels.map((label) =>
              editingId === label.id ? (
                <li key={label.id}>
                  <LabelEditor
                    initialName={label.name}
                    initialColor={label.color}
                    disabled={isPending}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(name, color) => {
                      const formData = new FormData();
                      formData.set("labelId", label.id);
                      formData.set("name", name);
                      formData.set("color", color);
                      run(() => updateLabelAction(formData));
                    }}
                    submitLabel="Save"
                  />
                </li>
              ) : (
                <li
                  key={label.id}
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                >
                  <span
                    className="h-4 w-6 rounded"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1 text-sm">{label.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setEditingId(label.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => {
                      const formData = new FormData();
                      formData.set("labelId", label.id);
                      run(() => deleteLabelAction(formData));
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ),
            )}
          </ul>
        )}

        {creating ? (
          <LabelEditor
            initialName=""
            initialColor={DEFAULT_BOARD_COLOR}
            disabled={isPending}
            onCancel={() => setCreating(false)}
            onSubmit={(name, color) => {
              const formData = new FormData();
              formData.set("boardId", boardId);
              formData.set("name", name);
              formData.set("color", color);
              run(() => createLabelAction(formData));
            }}
            submitLabel="Create"
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setCreating(true)}
          >
            New label
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

type LabelEditorProps = {
  initialName: string;
  initialColor: string;
  disabled: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (name: string, color: string) => void;
};

function LabelEditor({
  initialName,
  initialColor,
  disabled,
  submitLabel,
  onCancel,
  onSubmit,
}: LabelEditorProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Label name"
        disabled={disabled}
        className="h-9"
      />
      <ColorPalette value={color} onChange={setColor} disabled={disabled} />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || name.trim().length === 0}
          onClick={() => onSubmit(name.trim(), color)}
        >
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
