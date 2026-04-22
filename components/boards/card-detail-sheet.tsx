"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { createCommentAction, updateCardDetailsAction, assignCardMemberAction, removeCardMemberAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CardDetailRecord } from "@/lib/card";
import type { CommentRecord } from "@/lib/comment";
import type { ActivityRecord } from "@/lib/activity";
import type { CardMemberRecord, AssignableWorkspaceMemberRecord } from "@/lib/card-member";
import { cn } from "@/lib/utils";

type CardDetailSheetProps = {
  open: boolean;
  card: CardDetailRecord | null;
  comments: CommentRecord[];
  activity: ActivityRecord[];
  assignees: CardMemberRecord[];
  assignableMembers: AssignableWorkspaceMemberRecord[];
  canEdit: boolean;
  canComment: boolean;
};

export function CardDetailSheet({
  open,
  card,
  comments,
  activity,
  assignees,
  assignableMembers,
  canEdit,
  canComment,
}: CardDetailSheetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dismissedCardId, setDismissedCardId] = useState<string | null>(null);

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
          comments={comments}
          activity={activity}
          assignees={assignees}
          assignableMembers={assignableMembers}
          canEdit={canEdit}
          canComment={canComment}
        />
      </DialogContent>
    </Dialog>
  );
}

type CardDetailDialogBodyProps = {
  card: CardDetailRecord;
  comments: CommentRecord[];
  activity: ActivityRecord[];
  assignees: CardMemberRecord[];
  assignableMembers: AssignableWorkspaceMemberRecord[];
  canEdit: boolean;
  canComment: boolean;
};

function CardDetailDialogBody({
  card,
  comments,
  activity,
  assignees,
  assignableMembers,
  canEdit,
  canComment,
}: CardDetailDialogBodyProps) {
  const router = useRouter();
  const [draftTitle, setDraftTitle] = useState(card.title);
  const [draftDescription, setDraftDescription] = useState(card.description ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDirty =
    draftTitle.trim() !== card.title || draftDescription !== (card.description ?? "");
  const assignedMemberIds = new Set(assignees.map((member) => member.id));
  const availableMembers = assignableMembers.filter(
    (member) => !assignedMemberIds.has(member.id),
  );

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
    setError("");
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
          <p className="text-sm text-muted-foreground">
            Review this card, update its description, and prepare the space for collaboration.
          </p>
        </DialogHeader>

        <DialogClose asChild>
          <Button type="button" variant="ghost" size="sm">
            Close
          </Button>
        </DialogClose>
      </div>

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
                <ActionChip label="Labels" />
                <ActionChip label="Dates" />
                <ActionChip label="Checklist" />
                <ActionChip label="Members" />
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
                <textarea
                  id="card-detail-description"
                  value={draftDescription}
                  onChange={(e) => {
                    setDraftDescription(e.target.value);
                    setError("");
                  }}
                  disabled={isPending}
                  rows={10}
                  placeholder="Add a more detailed description..."
                  className="flex min-h-44 w-full rounded-lg border border-input bg-transparent px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
                      <div>
                        <div className="text-sm font-medium">{member.name}</div>
                        <div className="text-xs text-muted-foreground">{member.email}</div>
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
                          size="sm"
                          className="w-full justify-start"
                          disabled={isPending}
                          onClick={() => {
                            handleAssignMember(member.id);
                          }}
                        >
                          {member.name} ({member.email})
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <h3 className="text-sm font-semibold">Card metadata</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetaBlock label="Status" value="Ready for collaboration" />
                <MetaBlock label="Next use" value="Labels, dates, members, attachments" />
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

            <CommentComposer cardId={card.id} canComment={canComment} />

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
                      <CommentItem key={comment.id} comment={comment} />
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
};

function CommentComposer({ cardId, canComment }: CommentComposerProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

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
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setError("");
        }}
        disabled={isPending || !canComment}
        rows={3}
        placeholder={canComment ? "Write a comment..." : "You do not have permission to comment on this card."}
        className="flex min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
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
  comment: CommentRecord;
};

function CommentItem({ comment }: CommentItemProps) {
  const initials = comment.user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const date = new Date(comment.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.user.name}</span>
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
        </div>
      </div>
    </div>
  );
}

type ActivityItemProps = {
  activity: ActivityRecord;
};

function ActivityItem({ activity }: ActivityItemProps) {
  const initials = activity.user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {initials}
        </div>
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