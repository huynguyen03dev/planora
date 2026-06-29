"use client";

import { useState, useTransition, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  assignCardMemberAction,
  createCommentAction,
  removeCardMemberAction,
  updateCardCoverAction,
  setCardCoverAction,
  updateCardDetailsAction,
  updateCardDueDateAction,
  updateCardEstimateAction,
  updateCardPriorityAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardAttachments } from "@/components/boards/card-attachments";
import { CardChecklistsSection, type ChecklistData } from "@/components/boards/card-checklists-section";
import { CardLabelsSection, type LabelChip } from "@/components/boards/card-labels-section";
import type { CardDetailRecord } from "@/lib/card";
import type { CommentRecord } from "@/lib/comment";
import type { ActivityRecord } from "@/lib/activity";
import type { AttachmentRecord } from "@/lib/attachment";
import type { CardMemberRecord, AssignableWorkspaceMemberRecord } from "@/lib/card-member";
import { cn } from "@/lib/utils";
import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";
import { useMentionAutocomplete } from "./use-mention-autocomplete";

const estimateOptions = ["", "1", "2", "4", "8", "16"] as const;

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function MemberAvatar({
  name,
  image,
  size = "default",
  className,
}: {
  name: string;
  image?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {image ? <AvatarImage src={image} alt={name} /> : null}
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}


type UIComment = {
  id: string;
  content: string;
  createdAt: Date;
  user: { id: string; name: string; image: string | null };
};

type UIActivity = {
  id: string;
  action: string;
  entityType: string;
  createdAt: Date;
  user: { id: string; name: string; image: string | null };
  metadata: Record<string, unknown> | null;
};

type CardDetailSheetProps = {
  open: boolean;
  card: CardDetailRecord | null;
  comments: CommentRecord[];
  activity: ActivityRecord[];
  attachments: AttachmentRecord[];
  assignees: CardMemberRecord[];
  assignableMembers: AssignableWorkspaceMemberRecord[];
  boardId: string;
  boardLabels: LabelChip[];
  cardLabelIds: string[];
  checklists: ChecklistData[];
  canEdit: boolean;
  canComment: boolean;
};

export function CardDetailSheet({
  open,
  card,
  comments: initialComments,
  activity: initialActivity,
  attachments,
  assignees,
  assignableMembers,
  boardId,
  boardLabels,
  cardLabelIds,
  checklists,
  canEdit,
  canComment,
}: CardDetailSheetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const storeSelectedCard = useBoardStore((state) => state.selectedCard);
  const [dismissedCardId, setDismissedCardId] = useState<string | null>(null);

  const liveComments: UIComment[] =
    storeSelectedCard && card && storeSelectedCard.card.id === card.id
      ? storeSelectedCard.comments
      : initialComments;
  const liveActivity: UIActivity[] =
    storeSelectedCard && card && storeSelectedCard.card.id === card.id
      ? storeSelectedCard.activity
      : initialActivity;
  // Members render only here (not on the card face), so they live-update from
  // the store's selectedCard when this is the open card — mirroring comments.
  // This is what makes a remote assign/remove appear without a reload (US-011).
  const liveAssignees =
    storeSelectedCard && card && storeSelectedCard.card.id === card.id
      ? storeSelectedCard.assignees
      : assignees;
  const liveAssignableMembers: AssignableWorkspaceMemberRecord[] =
    storeSelectedCard && card && storeSelectedCard.card.id === card.id
      ? storeSelectedCard.assignableMembers.map((m) => ({ ...m, role: "" }))
      : assignableMembers;

  if (!card) {
    return null;
  }

  const currentCard = card;
  const isOpen = open && dismissedCardId !== currentCard.id;

  function handleClose() {
    setDismissedCardId(currentCard.id);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("cardId");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
    >
      <DialogContent className="h-[min(88vh,760px)] max-w-[min(96vw,1120px)] overflow-hidden p-0">
        <CardDetailDialogBody
          key={currentCard.id}
          card={currentCard}
          comments={liveComments}
          activity={liveActivity}
          attachments={attachments}
          assignees={liveAssignees}
          assignableMembers={liveAssignableMembers}
          boardId={boardId}
          boardLabels={boardLabels}
          cardLabelIds={cardLabelIds}
          checklists={checklists}
          canEdit={canEdit}
          canComment={canComment}
        />
      </DialogContent>
    </Dialog>
  );
}

type CardDetailDialogBodyProps = {
  card: CardDetailRecord;
  comments: UIComment[];
  activity: UIActivity[];
  attachments: AttachmentRecord[];
  assignees: CardMemberRecord[];
  // Role-less: the dropdown renders name/email only, and the live store snapshot
  // (selectedCard.assignableMembers) carries no role. AssignableWorkspaceMemberRecord
  // from the server prop is structurally assignable here (US-011).
  assignableMembers: AssignableWorkspaceMemberRecord[];
  boardId: string;
  boardLabels: LabelChip[];
  cardLabelIds: string[];
  checklists: ChecklistData[];
  canEdit: boolean;
  canComment: boolean;
};

function CardDetailDialogBody({
  card,
  comments,
  activity,
  attachments,
  assignees,
  assignableMembers,
  boardId,
  boardLabels,
  cardLabelIds,
  checklists,
  canEdit,
  canComment,
}: CardDetailDialogBodyProps) {
  const router = useRouter();
  const [draftTitle, setDraftTitle] = useState(card.title);
  const [draftDescription, setDraftDescription] = useState(card.description ?? "");
  const [draftEstimateHours, setDraftEstimateHours] = useState(
    card.estimateHours?.toString() ?? "",
  );
  const [draftDueDate, setDraftDueDate] = useState(toDateInputValue(card.dueDate));
  const [draftPriority, setDraftPriority] = useState(card.priority ?? "NONE");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDirty =
    draftTitle.trim() !== card.title || draftDescription !== (card.description ?? "");
  const assignedMemberIds = new Set(assignees.map((member) => member.id));
  const availableMembers = assignableMembers.filter(
    (member) => !assignedMemberIds.has(member.id),
  );

  // Covers may only be sourced from this card's own image attachments
  // (the server rejects anything else — US-018 anti-tracking-pixel contract).
  const imageAttachments = attachments.filter((attachment) =>
    attachment.fileType.startsWith("image/"),
  );

  function submitCover(coverImage: string) {
    setError("");
    const fd = new FormData();
    fd.set("cardId", card.id);
    fd.set("coverImage", coverImage);
    startTransition(async () => {
      const result = await updateCardCoverAction(fd);
      if (!result.success) setError(result.error);
      else router.refresh();
    });
  }

  function handleSave() {
    if (isPending) {
      return;
    }

    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }

    setError("");

    const formData = new FormData();
    formData.set("cardId", card.id);
    formData.set("title", trimmedTitle);
    formData.set("description", draftDescription);

    startTransition(async () => {
      const result = await updateCardDetailsAction(formData);
      if (!result.success) {
        setError(result.error);
      }
    });
  }

  function handleCancel() {
    setDraftTitle(card.title);
    setDraftDescription(card.description ?? "");
    setDraftEstimateHours(card.estimateHours?.toString() ?? "");
    setDraftDueDate(toDateInputValue(card.dueDate));
    setError("");
  }

  function handleSaveEstimate() {
    if (!canEdit || isPending) {
      return;
    }

    const formData = new FormData();
    formData.set("cardId", card.id);
    if (draftEstimateHours) {
      formData.set("estimateHours", draftEstimateHours);
    }

    startTransition(async () => {
      const result = await updateCardEstimateAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError("");
      router.refresh();
    });
  }

  function handleSaveDueDate() {
    if (!canEdit || isPending) {
      return;
    }

    const formData = new FormData();
    formData.set("cardId", card.id);
    if (draftDueDate) {
      formData.set("dueDate", draftDueDate);
    }

    startTransition(async () => {
      const result = await updateCardDueDateAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError("");
      router.refresh();
    });
  }

  async function handleAssignMember(userId: string) {
    if (!canEdit || isPending) {
      return;
    }

    setError("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("cardId", card.id);
      formData.set("userId", userId);

      const result = await assignCardMemberAction(formData);
      if (!result.success) {
        setError(result.error);
      } else {
        if (result.changed) {
          router.refresh();
        }
        setError("");
      }
    });
  }

  async function handleRemoveMember(userId: string) {
    if (!canEdit || isPending) {
      return;
    }

    setError("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("cardId", card.id);
      formData.set("userId", userId);

      const result = await removeCardMemberAction(formData);
      if (!result.success) {
        setError(result.error);
      } else {
        if (result.changed) {
          router.refresh();
        }
        setError("");
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-1">Card</span>
            <span>Board detail</span>
          </div>
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            {canEdit ? "Edit card" : "Card details"}
          </DialogTitle>
          <DialogDescription>
            Review this card, update its description, and prepare the space for collaboration.
          </DialogDescription>
        </DialogHeader>

        <DialogClose asChild>
          <Button type="button" variant="ghost" size="sm">
            Close
          </Button>
        </DialogClose>
      </div>

      {card.coverImage ? (
        <div className="relative">
          <img
            src={card.coverImage}
            alt="Card cover"
            className="h-48 w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <div className="min-h-0 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <section className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Title
                </p>
                {canEdit ? (
                  <Input
                    id="card-detail-title"
                    value={draftTitle}
                    onChange={(e) => {
                      setDraftTitle(e.target.value);
                      setError("");
                    }}
                    disabled={isPending}
                    className="h-11 text-lg font-semibold"
                  />
                ) : (
                  <h2 className="text-2xl font-semibold tracking-tight">{card.title}</h2>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <ActionChip label="Add" />
                <ActionChip label="Members" />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold">Cover</label>
                  {card.coverImage && canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => submitCover("")}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>

                {card.coverImage ? (
                  <img
                    src={card.coverImage}
                    alt="Cover preview"
                    className="h-12 w-full rounded object-cover"
                  />
                ) : null}

                {canEdit ? (
                  <>
                    {imageAttachments.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">
                          Choose from attachments
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {imageAttachments.map((attachment) => {
                            const isCurrent =
                              attachment.fileUrl === card.coverImage;
                            return (
                              <button
                                key={attachment.id}
                                type="button"
                                disabled={isPending}
                                title={attachment.fileName}
                                onClick={() => submitCover(attachment.fileUrl)}
                                className={cn(
                                  "relative aspect-video overflow-hidden rounded border-2 transition",
                                  isCurrent
                                    ? "border-primary"
                                    : "border-transparent hover:border-muted-foreground/40",
                                )}
                              >
                                <img
                                  src={attachment.fileUrl}
                                  alt={attachment.fileName}
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <input
                      type="file"
                      ref={coverInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setError("");
                        const fd = new FormData();
                        fd.set("cardId", card.id);
                        fd.set("file", file);
                        startTransition(async () => {
                          const result = await setCardCoverAction(fd);
                          if (!result.success) setError(result.error);
                          else router.refresh();
                        });
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      Upload new image
                    </Button>
                  </>
                ) : null}
              </div>
            </section>

            <CardLabelsSection
              cardId={card.id}
              boardId={boardId}
              boardLabels={boardLabels}
              cardLabelIds={cardLabelIds}
              canEdit={canEdit}
            />

            <CardChecklistsSection
              cardId={card.id}
              checklists={checklists}
              canEdit={canEdit}
            />

            <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="space-y-2">
                <label htmlFor="card-priority" className="text-sm font-semibold">
                  Priority
                </label>
                <Select
                  value={draftPriority}
                  onValueChange={(value) => {
                    setDraftPriority(value);
                    setError("");
                    const fd = new FormData();
                    fd.set("cardId", card.id);
                    fd.set("priority", value);
                    startTransition(async () => {
                      const result = await updateCardPriorityAction(fd);
                      if (!result.success) {
                        setError(result.error);
                        setDraftPriority(card.priority ?? "NONE");
                      } else router.refresh();
                    });
                  }}
                  disabled={!canEdit || isPending}
                >
                  <SelectTrigger id="card-priority" className="w-full">
                    <SelectValue placeholder="No priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No priority</SelectItem>
                    <SelectItem value="URGENT">🔴 Urgent</SelectItem>
                    <SelectItem value="HIGH">🟠 High</SelectItem>
                    <SelectItem value="MEDIUM">🟡 Medium</SelectItem>
                    <SelectItem value="LOW">🔵 Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="card-estimate-hours"
                  className="text-sm font-semibold"
                >
                  Estimate
                </label>
                <Select
                  value={draftEstimateHours === "" ? "none" : draftEstimateHours}
                  onValueChange={(value) => {
                    setDraftEstimateHours(value === "none" ? "" : value);
                    setError("");
                  }}
                  disabled={!canEdit || isPending || Boolean(card.completedAt)}
                >
                  <SelectTrigger id="card-estimate-hours" className="w-full">
                    <SelectValue placeholder="No estimate" />
                  </SelectTrigger>
                  <SelectContent>
                    {estimateOptions.map((option) => (
                      <SelectItem key={option || "none"} value={option || "none"}>
                        {option ? `${option}h` : "No estimate"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {card.completedAt ? (
                  <p className="text-xs text-muted-foreground">
                    Locked after first completion.
                  </p>
                ) : null}
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      isPending ||
                      Boolean(card.completedAt) ||
                      draftEstimateHours === (card.estimateHours?.toString() ?? "")
                    }
                    onClick={handleSaveEstimate}
                  >
                    Save estimate
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="card-due-date" className="text-sm font-semibold">
                  Due date
                </label>
                <Input
                  id="card-due-date"
                  type="date"
                  value={draftDueDate}
                  onChange={(event) => {
                    setDraftDueDate(event.target.value);
                    setError("");
                  }}
                  disabled={!canEdit || isPending}
                />
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending || draftDueDate === toDateInputValue(card.dueDate)}
                    onClick={handleSaveDueDate}
                  >
                    Save due date
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Description</h3>
                <span className="text-xs text-muted-foreground">
                  {canEdit ? "Editable" : "Read only"}
                </span>
              </div>

              {canEdit ? (
                <Textarea
                  id="card-detail-description"
                  value={draftDescription}
                  onChange={(e) => {
                    setDraftDescription(e.target.value);
                    setError("");
                  }}
                  disabled={isPending}
                  rows={10}
                  placeholder="Add a more detailed description..."
                  className="min-h-44"
                />
              ) : (
                <div className="min-h-44 rounded-lg border bg-muted/20 px-4 py-3 text-sm whitespace-pre-wrap">
                  {card.description || "No description yet."}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Members</h3>
                <span className="text-xs text-muted-foreground">
                  {canEdit ? "Manage assignees" : "Visible to all members"}
                </span>
              </div>

              {assignees.length === 0 ? (
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-sm text-muted-foreground">
                    No members assigned yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {assignees.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar name={member.name} image={member.image} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{member.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                        </div>
                      </div>
                      {canEdit ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => {
                            handleRemoveMember(member.id);
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {canEdit ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Add members</h4>
                  {availableMembers.length === 0 ? (
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-sm text-muted-foreground">
                        All workspace members are already assigned to this card.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {availableMembers.map((member) => (
                        <Button
                          key={member.id}
                          variant="outline"
                          className="h-auto w-full justify-start gap-3 py-2"
                          disabled={isPending}
                          onClick={() => {
                            handleAssignMember(member.id);
                          }}
                        >
                          <MemberAvatar name={member.name} image={member.image} size="sm" />
                          <span className="flex min-w-0 flex-col text-left">
                            <span className="truncate text-sm font-medium">{member.name}</span>
                            <span className="truncate text-xs font-normal text-muted-foreground">
                              {member.email}
                            </span>
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>

            <CardAttachments
              cardId={card.id}
              attachments={attachments}
              canEdit={canEdit}
            />

            <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <h3 className="text-sm font-semibold">Card metadata</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetaBlock
                  label="Estimate"
                  value={card.estimateHours ? `${card.estimateHours}h` : "Unestimated"}
                />
                <MetaBlock
                  label="Due date"
                  value={draftDueDate || "No due date"}
                />
              </div>
            </section>

            {canEdit && (
              <div className="flex items-center gap-2 border-t pt-4">
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !isDirty}
                  onClick={handleSave}
                >
                  {isPending ? "Saving..." : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending || !isDirty}
                  onClick={handleCancel}
                >
                  Reset
                </Button>
              </div>
            )}
          </div>
        </div>

        <aside className="min-h-0 overflow-y-auto border-t bg-muted/10 px-6 py-6 lg:border-l lg:border-t-0">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Comments and activity</h3>
                <p className="text-sm text-muted-foreground">
                  Collaboration history for this card.
                </p>
              </div>
            </div>

            <CommentComposer cardId={card.id} canComment={canComment} assignableMembers={assignableMembers} />

            {comments.length === 0 && activity.length === 0 ? (
              <div className="rounded-lg border bg-background p-4">
                <p className="text-sm text-muted-foreground">
                  No comments or activity yet. Start the conversation!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {comments.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Comments</h4>
                    {comments.map((comment) => (
                      <CommentItem key={comment.id} comment={comment} memberNames={assignableMembers.map((m) => m.name)} />
                    ))}
                  </div>
                )}

                {activity.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Activity</h4>
                    {activity.map((entry) => (
                      <ActivityItem key={entry.id} activity={entry} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

type ActionChipProps = {
  label: string;
};

function ActionChip({ label }: ActionChipProps) {
  return (
    <button
      type="button"
      disabled
      className={cn(
        "rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground",
        "disabled:cursor-default disabled:opacity-100",
      )}
    >
      {label}
    </button>
  );
}

type MetaBlockProps = {
  label: string;
  value: string;
};

function MetaBlock({ label, value }: MetaBlockProps) {
  return (
    <div className="space-y-1 rounded-md border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

type CommentComposerProps = {
  cardId: string;
  canComment: boolean;
  assignableMembers: AssignableWorkspaceMemberRecord[];
};

function CommentComposer({ cardId, canComment, assignableMembers }: CommentComposerProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    open: isMentionOpen,
    items: mentionItems,
    activeIndex: mentionActiveIndex,
    setActiveIndex: setMentionActiveIndex,
    setFloating: setMentionFloating,
    floatingStyles: mentionFloatingStyles,
    listboxId: mentionListboxId,
    optionId: mentionOptionId,
    selectMember: selectMentionMember,
    comboboxProps: mentionComboboxProps,
  } = useMentionAutocomplete({
    members: assignableMembers,
    value: content,
    setValue: (value) => {
      setContent(value);
      setError("");
    },
    textareaRef,
  });

  function handleSubmit() {
    if (!content.trim()) {
      setError("Comment cannot be empty");
      return;
    }

    setError("");

    const formData = new FormData();
    formData.set("cardId", cardId);
    formData.set("content", content.trim());

    startTransition(async () => {
      const result = await createCommentAction(formData);
      if (result.success) {
        setContent("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        value={content}
        disabled={isPending || !canComment}
        rows={3}
        placeholder={canComment ? "Write a comment..." : "You do not have permission to comment on this card."}
        className="min-h-20"
        {...mentionComboboxProps}
      />
      {isMentionOpen
        ? createPortal(
            <div
              ref={setMentionFloating}
              style={mentionFloatingStyles}
              id={mentionListboxId}
              role="listbox"
              aria-label="Mention a member"
              // pointer-events-auto: the list is portaled to <body>, which Radix
              // Dialog marks pointer-events:none while open; re-enable it here or
              // clicks fall through to the textarea behind the (inert) backdrop.
              className="pointer-events-auto z-50 w-56 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg"
            >
              {mentionItems.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No matches
                </div>
              ) : (
                mentionItems.map((member, index) => (
                  <div
                    key={member.id}
                    id={mentionOptionId(index)}
                    role="option"
                    aria-selected={index === mentionActiveIndex}
                    // Keep textarea focus on click so selection + caret restore work.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setMentionActiveIndex(index)}
                    onClick={() => selectMentionMember(member)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors",
                      index === mentionActiveIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-popover-foreground",
                    )}
                  >
                    <MemberAvatar name={member.name} image={member.image} size="sm" />
                    <span className="flex-1 truncate">{member.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {member.role}
                    </span>
                  </div>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {canComment && (
        <Button
          type="button"
          size="sm"
          disabled={isPending || !content.trim()}
          onClick={handleSubmit}
        >
          {isPending ? "Posting..." : "Post comment"}
        </Button>
      )}
    </div>
  );
}

type CommentItemProps = {
  comment: UIComment;
  memberNames: string[];
};

function renderMentionContent(content: string, memberNames: string[]) {
  if (!memberNames.length) return content;

  const lowerNames = memberNames.map((n) => n.toLowerCase());
  const result: React.ReactNode[] = [];
  let i = 0;
  let plainStart = 0;

  function flushPlain(end: number) {
    if (end > plainStart) {
      result.push(content.slice(plainStart, end));
      plainStart = end;
    }
  }

  while (i < content.length) {
    if (content[i] === "@" && i + 1 < content.length) {
      let bestMatch: { name: string; endIndex: number } | null = null;

      for (let j = 0; j < memberNames.length; j++) {
        const name = memberNames[j];
        const lowerName = lowerNames[j];
        const afterAt = content.slice(i + 1);
        if (afterAt.toLowerCase().startsWith(lowerName)) {
          const endIdx = i + 1 + name.length;
          const nextChar = content[endIdx];
          if (!nextChar || !/[a-zA-Z]/.test(nextChar)) {
            if (!bestMatch || name.length > bestMatch.name.length) {
              bestMatch = { name, endIndex: endIdx };
            }
          }
        }
      }

      if (bestMatch) {
        flushPlain(i);
        result.push(
          <span
            key={i}
            className="rounded bg-[var(--chart-2)]/10 px-0.5 font-medium text-[var(--chart-2)]"
          >
            @{bestMatch.name}
          </span>
        );
        i = bestMatch.endIndex;
        plainStart = i;
        continue;
      }
    }
    i++;
  }

  flushPlain(content.length);
  return result;
}

function CommentItem({ comment, memberNames }: CommentItemProps) {
  const date = new Date(comment.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start gap-3">
        <MemberAvatar name={comment.user.name} image={comment.user.image} />
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.user.name}</span>
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{renderMentionContent(comment.content, memberNames)}</p>
        </div>
      </div>
    </div>
  );
}

type ActivityItemProps = {
  activity: UIActivity;
};

function ActivityItem({ activity }: ActivityItemProps) {
  const date = new Date(activity.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const actionLabel = getActivityLabel(activity.action, activity.entityType, activity.metadata);

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start gap-3">
        <MemberAvatar name={activity.user.name} image={activity.user.image} />
        <div className="min-w-0 space-y-1">
          <p className="text-sm">
            <span className="font-medium">{activity.user.name}</span>{" "}
            {actionLabel}
          </p>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>
      </div>
    </div>
  );
}

function getActivityLabel(action: string, entityType: string, metadata: Record<string, unknown> | null): string {
  // Handle member assignment activities
  if (metadata && typeof metadata === "object" && "actionType" in metadata) {
    const actionType = (metadata as { actionType: string }).actionType;
    const targetName = (metadata as { targetUserName?: string }).targetUserName || "a member";
    
    if (actionType === "assign-member") {
      return `assigned ${targetName} to this card`;
    } else if (actionType === "remove-member") {
      return `removed ${targetName} from this card`;
    }
  }

  const entityLabels: Record<string, string> = {
    CARD: "card",
    LIST: "list",
    BOARD: "board",
    COMMENT: "comment",
  };

  const entity = entityLabels[entityType] || entityType.toLowerCase();

  const actionLabels: Record<string, string> = {
    CREATED: `created this ${entity}`,
    UPDATED: `updated this ${entity}`,
    MOVED: `moved this ${entity}`,
    ARCHIVED: `archived this ${entity}`,
    COMMENTED: "commented",
    DELETED: `deleted this ${entity}`,
  };

  return actionLabels[action] || `${action.toLowerCase()} this ${entity}`;
}
