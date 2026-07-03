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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ColorPalette } from "@/components/boards/color-palette";
import { DEFAULT_BOARD_COLOR } from "@/lib/constants";
import { labelChipStyle, labelSwatchStyle } from "@/lib/label-colors";
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

  // Compact meta-row form (US-052): the label lives in the card-detail property
  // strip, so this renders inline — attached chips + an attach popover + the
  // manage dialog — not a full boxed section with its own heading.
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      {attached.length > 0 ? (
        attached.map((label) => (
          // Tinted chip (US-051): per-hue tint bg + deeper same-hue text, name
          // as the non-color channel. The remove × inherits the chip's text
          // color (currentColor) and dims on idle.
          <span
            key={label.id}
            className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm font-medium"
            style={labelChipStyle(label.color)}
          >
            {label.name}
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label.name}`}
                className="h-4 w-4 p-0 rounded-full hover:bg-transparent opacity-70 hover:opacity-100"
                disabled={isPending}
                onClick={() => toggleAttached(label.id, true)}
              >
                ×
              </Button>
            ) : null}
          </span>
        ))
      ) : (
        <span className="text-sm text-muted-foreground">
          {canEdit ? "No labels yet" : "None"}
        </span>
      )}

      {canEdit ? (
        <>
          {boardLabels.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Add
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 space-y-1.5">
                <p className="text-sm font-semibold">Attach labels</p>
                <ul className="space-y-1.5">
                  {boardLabels.map((label) => (
                    <li key={label.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        className={cn(
                          "flex w-full h-auto justify-start gap-2 rounded-md border px-2 py-1.5 text-left text-sm font-normal disabled:opacity-50 hover:bg-muted",
                          attachedIds.has(label.id) ? "font-semibold" : "font-normal",
                        )}
                        disabled={isPending}
                        aria-pressed={attachedIds.has(label.id)}
                        onClick={() =>
                          toggleAttached(label.id, attachedIds.has(label.id))
                        }
                      >
                        <span
                          className="h-4 w-6 rounded-sm border"
                          style={labelSwatchStyle(label.color)}
                        />
                        <span className="flex-1">{label.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {attachedIds.has(label.id) ? "On" : "Off"}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          ) : null}
          <ManageLabelsDialog boardId={boardId} boardLabels={boardLabels} />
        </>
      ) : null}

      {error ? (
        <p className="w-full text-sm text-destructive">{error}</p>
      ) : null}
    </div>
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
                    className="h-4 w-6 rounded-sm border"
                    style={labelSwatchStyle(label.color)}
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
