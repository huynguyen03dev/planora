"use client";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive02Icon,
  Attachment01Icon,
  Calendar03Icon,
  Cancel01Icon,
  Flag03Icon,
  Image01Icon,
  Tag01Icon,
  Task01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { format } from "date-fns";

import {
  assignCardMemberAction,
  createCommentAction,
  loadMoreCardDetailAction,
  removeCardMemberAction,
  updateCardCoverAction,
  setCardCoverAction,
  updateCardDetailsAction,
  updateCardDueDateAction,
  updateCardEstimateAction,
  updateCardPriorityAction,
} from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArchiveCardDialog } from "@/components/boards/archive-card-dialog";
import { CardAttachments } from "@/components/boards/card-attachments";
import { CardCompletionToggle } from "@/components/boards/card-completion-toggle";
import { CardChecklistsSection, type ChecklistData } from "@/components/boards/card-checklists-section";
import { CardLabelsSection, type LabelChip } from "@/components/boards/card-labels-section";
import type { CardDetailRecord } from "@/lib/card";
import type { CommentRecord } from "@/lib/comment";
import type { ActivityRecord } from "@/lib/activity";
import type { AttachmentRecord } from "@/lib/attachment";
import type { CardMemberRecord, AssignableWorkspaceMemberRecord } from "@/lib/card-member";
import { cn } from "@/lib/utils";
import { resolveMentions } from "@/lib/mention";
import { useBoardStore } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/board-store";
import { useMentionAutocomplete } from "./use-mention-autocomplete";

const estimateOptions = ["", "1", "2", "4", "8", "16"] as const;

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

// The due-date wire format stays the "YYYY-MM-DD" string the existing
// updateCardDueDateAction expects (z.coerce.date()). Parse/format it in *local*
// terms so the calendar shows the day the string names regardless of timezone.
function parseDateInputValue(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toDueDateValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
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
  /** True when more comments exist behind the seeded page (server-derived). */
  commentsHasMore: boolean;
  activity: ActivityRecord[];
  /** True when more activity exists behind the seeded page (server-derived). */
  activityHasMore: boolean;
  attachments: AttachmentRecord[];
  assignees: CardMemberRecord[];
  assignableMembers: AssignableWorkspaceMemberRecord[];
  boardId: string;
  boardLabels: LabelChip[];
  cardLabelIds: string[];
  checklists: ChecklistData[];
  canEdit: boolean;
  canArchive: boolean;
  canComment: boolean;
};

export function CardDetailSheet({
  open,
  card,
  comments: initialComments,
  commentsHasMore,
  activity: initialActivity,
  activityHasMore,
  attachments,
  assignees,
  assignableMembers,
  boardId,
  boardLabels,
  cardLabelIds,
  checklists,
  canEdit,
  canArchive,
  canComment,
}: CardDetailSheetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const storeSelectedCard = useBoardStore((state) => state.selectedCard);
  const [dismissedCardId, setDismissedCardId] = useState<string | null>(null);

  // The URL is the authority for "is a card selected". The `open`/`card` props
  // are server-derived and can lag reality: router.replace() is async, and a
  // stale in-flight router.refresh() payload (fetched while ?cardId was still in
  // the URL — queued autosave, socket reconnect, list:restored, drag resync) can
  // land AFTER the close navigation. page.tsx keys this component by the server
  // card id (`selectedCard?.id ?? "card-detail-sheet-closed"`), so that stale
  // payload REMOUNTS the sheet with open=true and a reset dismissedCardId — the
  // dialog would flash open even though the URL no longer selects a card. The
  // urlCardId check keeps the dialog closed across that remount (close-flash).
  const urlCardId = searchParams.get("cardId");

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
  // F4 (round-2): the open sheet's label set merges from the store when this is
  // the open card — mirroring comments/members — so a remote label attach /
  // detach (or the rename/recolor fan-out) reaches the sheet live, instead of
  // waiting for a router.refresh to reseed the server `cardLabelIds` prop. The
  // seed (page.tsx) guarantees the fresh-open case matches the prop; the
  // attach/remove round-trip in the sheet stays server-authoritative.
  const storeLabels =
    storeSelectedCard && card && storeSelectedCard.card.id === card.id
      ? storeSelectedCard.labels
      : null;
  const liveLabelIds: string[] = storeLabels
    ? storeLabels.map((label) => label.id)
    : cardLabelIds;
  // Chips render from boardLabels filtered by the attached ids — override the
  // open card's entries with the live store snapshot so a remote rename/recolor
  // updates the chip text/color too, and union any store label the (stale)
  // prop list lacks (a label created remotely while the sheet is open).
  const liveBoardLabels: LabelChip[] = storeLabels
    ? [
        ...boardLabels.map(
          (label) => storeLabels.find((s) => s.id === label.id) ?? label,
        ),
        ...storeLabels.filter((s) => !boardLabels.some((b) => b.id === s.id)),
      ]
    : boardLabels;

  if (!card) {
    return null;
  }

  const currentCard = card;
  const isOpen =
    open &&
    urlCardId === currentCard.id &&
    dismissedCardId !== currentCard.id;

  // Once the URL stops selecting this card, the dismissal latch is obsolete
  // (the router.replace committed). Forget it so a later intentional reopen
  // (BoardContent.openCard pushes ?cardId again) isn't swallowed — even when a
  // stale server payload keeps this instance mounted with the same key. The
  // urlCardId check above keeps the dialog closed regardless, so clearing the
  // latch can never reopen it by itself. This is the React "adjust state during
  // render" pattern (guarded, so it can't loop) — same as the title/description
  // baseline sync below.
  if (dismissedCardId === currentCard.id && urlCardId !== currentCard.id) {
    setDismissedCardId(null);
  }

  // Bind the hero title/description to the live store value (not the stale server
  // prop) so a remote rename or description edit isn't clobbered when the field
  // blurs (US-043). Comments/activity/members already merge from the store above.
  const liveCard: CardDetailRecord =
    storeSelectedCard && storeSelectedCard.card.id === currentCard.id
      ? {
          ...currentCard,
          title: storeSelectedCard.card.title,
          description: storeSelectedCard.card.description,
        }
      : currentCard;

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
      <DialogContent
        className="h-[min(90vh,820px)] max-w-[min(96vw,768px)] overflow-hidden bg-popover p-0"
        onEscapeKeyDown={(e) => {
          // While the hero title is being edited, Escape reverts the field
          // (handled on the input) and must NOT close the dialog. Cancel Radix's
          // dismiss here — the supported API — only when the title input holds an
          // unsaved edit; otherwise Escape closes the dialog as usual (US-043).
          const active = document.activeElement as HTMLInputElement | null;
          if (
            active?.id === "card-detail-title" &&
            active.value !== liveCard.title
          ) {
            e.preventDefault();
          }
        }}
      >
        <CardDetailDialogBody
          key={currentCard.id}
          card={liveCard}
          comments={liveComments}
          commentsHasMore={commentsHasMore}
          activity={liveActivity}
          activityHasMore={activityHasMore}
          attachments={attachments}
          assignees={liveAssignees}
          assignableMembers={liveAssignableMembers}
          boardId={boardId}
          boardLabels={liveBoardLabels}
          cardLabelIds={liveLabelIds}
          checklists={checklists}
          canEdit={canEdit}
          canArchive={canArchive}
          canComment={canComment}
        />
      </DialogContent>
    </Dialog>
  );
}

type CardDetailDialogBodyProps = {
  card: CardDetailRecord;
  comments: UIComment[];
  /** True when more comments exist behind the seeded page (server-derived). */
  commentsHasMore: boolean;
  activity: UIActivity[];
  /** True when more activity exists behind the seeded page (server-derived). */
  activityHasMore: boolean;
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
  canArchive: boolean;
  canComment: boolean;
};

function CardDetailDialogBody({
  card,
  comments,
  commentsHasMore,
  activity,
  activityHasMore,
  attachments,
  assignees,
  assignableMembers,
  boardId,
  boardLabels,
  cardLabelIds,
  checklists,
  canEdit,
  canArchive,
  canComment,
}: CardDetailDialogBodyProps) {
  const router = useRouter();
  const [draftTitle, setDraftTitle] = useState(card.title);
  const [draftDescription, setDraftDescription] = useState(card.description ?? "");
  const [draftEstimateHours, setDraftEstimateHours] = useState(
    card.estimateHours?.toString() ?? "",
  );
  const [draftDueDate, setDraftDueDate] = useState(toDateInputValue(card.dueDate));
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [draftPriority, setDraftPriority] = useState(card.priority ?? "NONE");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  // Save lifecycle (U2/U3): "saving" while a queued save drains, "saved" for
  // a ~1.5s confirmation after the last successful save, "idle" otherwise.
  // Failures surface through `error` (full text, no truncation).
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  // Cursor-paginated comments/activity: the first page is server-seeded (props),
  // and these hold the pages appended via "Load more". The body is keyed by
  // card id, so all of this resets when a different card opens. `hasMore` is
  // seeded from the server flag and updated from each action response.
  const [extraComments, setExtraComments] = useState<UIComment[]>([]);
  const [extraActivity, setExtraActivity] = useState<UIActivity[]>([]);
  const [commentsHasMoreState, setCommentsHasMoreState] = useState(commentsHasMore);
  const [activityHasMoreState, setActivityHasMoreState] = useState(activityHasMore);
  const [commentsPending, startCommentsTransition] = useTransition();
  const [activityPending, startActivityTransition] = useTransition();
  const selectedDueDate = parseDateInputValue(draftDueDate);

  // The hero title/description bind to the live store value (passed in via
  // `card`). Reflect a remote edit into the draft whenever the local user isn't
  // actively typing that field, so the next blur can't clobber a remote rename
  // (US-043). This is the React "adjust state during render" pattern (guarded by
  // a baseline so it can't loop) — not an effect — and the focus flags keep an
  // in-progress local edit from being overwritten mid-keystroke.
  const [titleEditing, setTitleEditing] = useState(false);
  const [descriptionEditing, setDescriptionEditing] = useState(false);

  const [titleBaseline, setTitleBaseline] = useState(card.title);
  if (card.title !== titleBaseline) {
    setTitleBaseline(card.title);
    if (!titleEditing) setDraftTitle(card.title);
  }

  const liveDescription = card.description ?? "";
  const [descriptionBaseline, setDescriptionBaseline] = useState(liveDescription);
  if (liveDescription !== descriptionBaseline) {
    setDescriptionBaseline(liveDescription);
    if (!descriptionEditing) setDraftDescription(liveDescription);
  }

  // Queued autosave (U2): a blur/commit that lands while a save is in flight
  // is queued and drained when the in-flight save finishes (Notion/Trello
  // style) — the old `if (isPending) return` silently discarded it. No control
  // is disabled by another field's save; only the status indicator reflects
  // in-flight state.
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueRef = useRef<Array<() => Promise<boolean>>>([]);
  const drainingRef = useRef(false);
  // Last values successfully persisted for title+description, so a queued
  // no-op blur after a save completes doesn't rewrite identical data.
  const lastSavedDetailsRef = useRef({
    title: card.title,
    description: card.description ?? "",
  });

  function showSaved() {
    setSaveStatus("saved");
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = setTimeout(() => {
      setSaveStatus("idle");
    }, 1500);
  }

  function queueSave(action: () => Promise<boolean>) {
    queueRef.current.push(action);
    setSaveStatus("saving");
    if (drainingRef.current) {
      return;
    }
    drainingRef.current = true;
    void (async () => {
      let savedAny = false;
      while (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        const ok = await next();
        if (ok) {
          savedAny = true;
        }
      }
      drainingRef.current = false;
      if (savedAny) {
        showSaved();
      } else {
        setSaveStatus("idle");
      }
    })();
  }

  // Clear the "Saved" timer on unmount so a late callback can't set state on
  // an unmounted dialog body.
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  // Action-row affordances scroll the matching editor into view inside the left
  // column and move focus to its primary control, so the document-style "Add to
  // card" row is keyboard-operable and every editor stays reachable (US-043).
  function focusSection(sectionId: string, focusId?: string) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    const target = focusId
      ? document.getElementById(focusId)
      : section.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
    target?.focus({ preventScroll: true });
  }

  const assignedMemberIds = new Set(assignees.map((member) => member.id));
  const availableMembers = assignableMembers.filter(
    (member) => !assignedMemberIds.has(member.id),
  );

  // Covers may only be sourced from this card's own image attachments
  // (the server rejects anything else — US-018 anti-tracking-pixel contract).
  const imageAttachments = attachments.filter((attachment) =>
    attachment.fileType.startsWith("image/"),
  );

  // One canonical list per section: seeded items + loaded pages, deduped by id
  // and sorted by the same key the cursors use. Comments render oldest first
  // (createdAt asc, id asc — the DB order); activity newest first (createdAt
  // desc, id desc). Sorting keeps realtime-appended rows (store) interleaved
  // correctly with loaded pages instead of drifting to the wrong end.
  const displayedComments = useMemo(() => {
    const seen = new Set<string>();
    return [...comments, ...extraComments]
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.id.localeCompare(b.id),
      )
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
  }, [comments, extraComments]);

  const displayedActivity = useMemo(() => {
    const seen = new Set<string>();
    return [...activity, ...extraActivity]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          b.id.localeCompare(a.id),
      )
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
  }, [activity, extraActivity]);

  // Fetches the next page behind the last loaded row. The cursor is the
  // (createdAt, id) of the last displayed item — matching the server order —
  // so rows appended by realtime while the sheet is open never shift or
  // duplicate pages. Appends with an id dedupe as a safety net.
  function loadMoreComments() {
    const cursor = displayedComments[displayedComments.length - 1];
    if (!cursor) return;
    startCommentsTransition(async () => {
      const formData = new FormData();
      formData.set("cardId", card.id);
      formData.set("section", "comments");
      formData.set("cursorCreatedAt", new Date(cursor.createdAt).toISOString());
      formData.set("cursorId", cursor.id);
      const result = await loadMoreCardDetailAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.section !== "comments") {
        // Defensive: the action must echo the requested section.
        return;
      }
      setError("");
      setExtraComments((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const additions = result.items
          .map((item) => ({
            id: item.id,
            content: item.content,
            createdAt: new Date(item.createdAt),
            user: item.user,
          }))
          .filter((item) => !seen.has(item.id));
        return [...prev, ...additions];
      });
      setCommentsHasMoreState(result.hasMore);
    });
  }

  function loadMoreActivity() {
    const cursor = displayedActivity[displayedActivity.length - 1];
    if (!cursor) return;
    startActivityTransition(async () => {
      const formData = new FormData();
      formData.set("cardId", card.id);
      formData.set("section", "activity");
      formData.set("cursorCreatedAt", new Date(cursor.createdAt).toISOString());
      formData.set("cursorId", cursor.id);
      const result = await loadMoreCardDetailAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.section !== "activity") {
        // Defensive: the action must echo the requested section.
        return;
      }
      setError("");
      setExtraActivity((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const additions = result.items
          .map((item) => ({
            id: item.id,
            action: item.action,
            entityType: item.entityType,
            createdAt: new Date(item.createdAt),
            user: item.user,
            metadata: item.metadata,
          }))
          .filter((item) => !seen.has(item.id));
        return [...prev, ...additions];
      });
      setActivityHasMoreState(result.hasMore);
    });
  }

  function submitCover(coverImage: string) {
    setError("");
    queueSave(async () => {
      const fd = new FormData();
      fd.set("cardId", card.id);
      fd.set("coverImage", coverImage);
      const result = await updateCardCoverAction(fd);
      if (!result.success) {
        setError(result.error);
        return false;
      }
      setError("");
      router.refresh();
      return true;
    });
  }

  // Unified save model (US-032): every field autosaves, so the three competing
  // save surfaces (Save changes/Reset, Save estimate, Save due date) are gone.
  // Title + description persist on blur; estimate, due date, and priority commit
  // on change — matching the Priority control that already autosaved. Blurs that
  // land while a save is in flight are queued, never dropped (U2).
  function queueSaveDetails(nextTitle: string, nextDescription: string) {
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      // Title is required — revert to the last persisted value rather than
      // leaving the card in an unsaveable empty state.
      setDraftTitle(card.title);
      setError("Title cannot be empty — reverted to the previous title.");
      return;
    }

    setError("");

    queueSave(async () => {
      if (
        lastSavedDetailsRef.current.title === trimmedTitle &&
        lastSavedDetailsRef.current.description === nextDescription
      ) {
        // Nothing changed since the last successful save — no write, and no
        // "Saved" flash for a pure focus/blur.
        return false;
      }

      const formData = new FormData();
      formData.set("cardId", card.id);
      formData.set("title", trimmedTitle);
      formData.set("description", nextDescription);

      const result = await updateCardDetailsAction(formData);
      if (!result.success) {
        setError(result.error);
        return false;
      }
      setError("");
      lastSavedDetailsRef.current = {
        title: trimmedTitle,
        description: nextDescription,
      };
      return true;
    });
  }

  function queueSaveEstimate(nextEstimate: string) {
    if (!canEdit) {
      return;
    }

    queueSave(async () => {
      const formData = new FormData();
      formData.set("cardId", card.id);
      if (nextEstimate) {
        formData.set("estimateHours", nextEstimate);
      }

      const result = await updateCardEstimateAction(formData);
      if (!result.success) {
        setError(result.error);
        setDraftEstimateHours(card.estimateHours?.toString() ?? "");
        return false;
      }
      setError("");
      router.refresh();
      return true;
    });
  }

  function queueSaveDueDate(nextDueDate: string) {
    if (!canEdit) {
      return;
    }

    queueSave(async () => {
      const formData = new FormData();
      formData.set("cardId", card.id);
      if (nextDueDate) {
        formData.set("dueDate", nextDueDate);
      }

      const result = await updateCardDueDateAction(formData);
      if (!result.success) {
        setError(result.error);
        setDraftDueDate(toDateInputValue(card.dueDate));
        return false;
      }
      setError("");
      router.refresh();
      return true;
    });
  }

  function queueSavePriority(nextPriority: string) {
    queueSave(async () => {
      const fd = new FormData();
      fd.set("cardId", card.id);
      fd.set("priority", nextPriority);
      const result = await updateCardPriorityAction(fd);
      if (!result.success) {
        setError(result.error);
        setDraftPriority(card.priority ?? "NONE");
        return false;
      }
      setError("");
      router.refresh();
      return true;
    });
  }

  function handleAssignMember(userId: string) {
    if (!canEdit) {
      return;
    }

    setError("");

    queueSave(async () => {
      const formData = new FormData();
      formData.set("cardId", card.id);
      formData.set("userId", userId);

      const result = await assignCardMemberAction(formData);
      if (!result.success) {
        setError(result.error);
        return false;
      }
      if (result.changed) {
        router.refresh();
      }
      setError("");
      return true;
    });
  }

  function handleRemoveMember(userId: string) {
    if (!canEdit) {
      return;
    }

    setError("");

    queueSave(async () => {
      const formData = new FormData();
      formData.set("cardId", card.id);
      formData.set("userId", userId);

      const result = await removeCardMemberAction(formData);
      if (!result.success) {
        setError(result.error);
        return false;
      }
      if (result.changed) {
        router.refresh();
      }
      setError("");
      return true;
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Document-style header: the title is the hero (inline-editable), with an
          "Add to card" action row beneath it — no breadcrumb, no "Edit card"
          heading, no uppercase TITLE label (US-043). The Dialog still needs an
          accessible name/description for Radix + screen readers, supplied
          visually-hidden below. */}
      <DialogTitle className="sr-only">{card.title || "Card details"}</DialogTitle>
      <DialogDescription className="sr-only">
        Card details and editors. Edit the title, description, labels, dates,
        checklist, members, attachments, and post comments.
      </DialogDescription>

      <div className="space-y-3 border-b px-8 py-4">
        <div className="flex items-start justify-between gap-3">
          <CardCompletionToggle
            cardId={card.id}
            completedAt={card.completedAt}
            canEdit={canEdit}
            variant="hero"
            onError={setError}
            className="mt-1.5"
          />
          {canEdit ? (
            <input
              id="card-detail-title"
              aria-label="Card title"
              value={draftTitle}
              onChange={(e) => {
                setDraftTitle(e.target.value);
                setError("");
              }}
              onFocus={(e) => {
                setTitleEditing(true);
                // Radix's auto-focus-on-open (and a Tab into the field) selects
                // the whole title, so a stray keystroke would wipe it. After the
                // browser settles, collapse a full selection to the caret-at-end;
                // a click that places its own caret is left untouched (US-043).
                const el = e.currentTarget;
                requestAnimationFrame(() => {
                  if (
                    el.value.length > 0 &&
                    el.selectionStart === 0 &&
                    el.selectionEnd === el.value.length
                  ) {
                    const end = el.value.length;
                    el.setSelectionRange(end, end);
                  }
                });
              }}
              onBlur={() => {
                setTitleEditing(false);
                queueSaveDetails(draftTitle, draftDescription);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  // Revert the field to the live value, in place (keep focus so
                  // the caret stays put). The dialog is kept open by the
                  // DialogContent onEscapeKeyDown guard above (US-043).
                  setDraftTitle(card.title);
                  setError("");
                }
              }}
              // card-title token: 22px / weight 500 / 1.25 / -0.4px tracking
              // (DESIGN.md §244 / §335), not the old text-2xl/600.
              className="-mx-2 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-[22px] font-medium leading-[1.25] tracking-[-0.4px] outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            />
          ) : (
            <h2 className="min-w-0 flex-1 px-0 py-1 text-[22px] font-medium leading-[1.25] tracking-[-0.4px]">
              {card.title}
            </h2>
          )}

          <div className="flex shrink-0 items-center gap-2 pt-1.5">
            {/* Save/error status lives inline in the header (Google-Docs style) so
                it takes no vertical room — it used to be an empty min-h spacer at
                the top of the column that pushed the Description down (US-043). */}
            <span
              aria-live="polite"
              title={
                error ||
                (saveStatus === "saving"
                  ? "Saving…"
                  : saveStatus === "saved"
                    ? "Saved"
                    : undefined)
              }
              // No truncate on errors: a failure message must read in full
              // (U3). Status text is short and wraps harmlessly within the cap.
              className={cn(
                "max-w-56 text-xs",
                error ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {error
                ? error
                : saveStatus === "saving"
                  ? "Saving…"
                  : saveStatus === "saved"
                    ? "Saved"
                    : null}
            </span>

            {canArchive ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Archive card"
                title="Archive"
                onClick={() => setArchiveDialogOpen(true)}
              >
                <HugeiconsIcon icon={Archive02Icon} size={18} strokeWidth={2} />
              </Button>
            ) : null}

            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close card"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
              </Button>
            </DialogClose>

            {/* Archive confirm (portal — in-tree position is irrelevant). Any
                card is archivable from here regardless of completion state; the
                board face only offers archive on completed cards (US-069). */}
            {canArchive ? (
              <ArchiveCardDialog
                cardId={card.id}
                cardTitle={card.title}
                open={archiveDialogOpen}
                onOpenChange={setArchiveDialogOpen}
                onError={setError}
              />
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Add to card
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => focusSection("card-section-labels")}
            >
              <HugeiconsIcon icon={Tag01Icon} size={16} strokeWidth={2} />
              Labels
            </Button>
            {/* Order mirrors the body section order (Labels → Checklist →
                Priority → Dates) so clicking the row left-to-right scrolls
                monotonically down, never up-then-down (US-043). */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => focusSection("card-section-checklist")}
            >
              <HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={2} />
              Checklist
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => focusSection("card-section-priority", "card-priority")}
            >
              <HugeiconsIcon icon={Flag03Icon} size={16} strokeWidth={2} />
              Priority
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => focusSection("card-section-dates", "card-due-date")}
            >
              <HugeiconsIcon icon={Calendar03Icon} size={16} strokeWidth={2} />
              Dates
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => focusSection("card-section-members")}
            >
              <HugeiconsIcon icon={UserMultipleIcon} size={16} strokeWidth={2} />
              Members
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => focusSection("card-section-attachments")}
            >
              <HugeiconsIcon icon={Attachment01Icon} size={16} strokeWidth={2} />
              Attachment
            </Button>

            {/* Cover demoted from a top-of-column panel to a secondary action
                (US-043). Both paths preserved: pick an existing image attachment
                or upload a new one, including the zero-attachments case. */}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <HugeiconsIcon icon={Image01Icon} size={16} strokeWidth={2} />
                  Cover
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Cover</p>
                  {card.coverImage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
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
                    className="h-16 w-full rounded object-cover"
                  />
                ) : null}

                {imageAttachments.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      Choose from attachments
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {imageAttachments.map((attachment) => {
                        const isCurrent = attachment.fileUrl === card.coverImage;
                        return (
                          <button
                            key={attachment.id}
                            type="button"
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
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No image attachments yet. Upload one below to use as a cover.
                  </p>
                )}

                <input
                  type="file"
                  ref={coverInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setError("");
                    queueSave(async () => {
                      const fd = new FormData();
                      fd.set("cardId", card.id);
                      fd.set("file", file);
                      const result = await setCardCoverAction(fd);
                      if (!result.success) {
                        setError(result.error);
                        return false;
                      }
                      setError("");
                      router.refresh();
                      return true;
                    });
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => coverInputRef.current?.click()}
                >
                  Upload new image
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
      </div>

      {card.coverImage ? (
        <div className="relative">
          <img
            src={card.coverImage}
            alt="Card cover"
            className="h-48 w-full object-cover"
          />
          {/* US-053: kept intentionally. This is a bottom-edge fade over an
              arbitrary user-supplied cover image so it blends into the document
              surface below — a legibility scrim over user content, not a
              decorative chrome gradient. The §389 ban targets atmospheric chrome
              gradients; a solid bg-background/80 here would wash out the cover. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
        </div>
      ) : null}

      {/* Single ~720px reading column (the modal width is the document measure)
          with 32px padding. Sub-sections are divided by border hairlines, not
          boxed sub-cards, and the former right rail collapses into the stack
          (US-052 / DESIGN.md §103–110 / §332–340). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        {/* Properties (meta row): the relocated right-rail controls + the former
            priority/dates sub-card boxes collapse into one compact, de-boxed
            property strip under the title. Property labels/controls stay
            body-sm (14px); only the document body (description, comments) steps
            to body (16px) — DESIGN.md §256–258. */}
        <div className="space-y-3">
          <div id="card-section-members" className="flex items-start gap-3">
            <span className="w-20 shrink-0 pt-1.5 text-sm text-muted-foreground">
              Members
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {assignees.length > 0 ? (
                assignees.map((member) => (
                  <span
                    key={member.id}
                    className="flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2.5 text-sm"
                  >
                    <MemberAvatar seed={member.id} name={member.name} image={member.image} size="sm" />
                    <span className="max-w-40 truncate">{member.name}</span>
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${member.name}`}
                        className="h-4 w-4 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-transparent"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        ×
                      </Button>
                    ) : null}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  {canEdit ? "No members yet" : "None"}
                </span>
              )}
              {canEdit ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <HugeiconsIcon icon={UserMultipleIcon} size={16} strokeWidth={2} />
                      Add
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 space-y-2">
                    <p className="text-sm font-semibold">Assign members</p>
                    {availableMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        All workspace members are already assigned to this card.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {availableMembers.map((member) => (
                          <Button
                            key={member.id}
                            variant="ghost"
                            className="h-auto w-full justify-start gap-3 py-1.5"
                            onClick={() => handleAssignMember(member.id)}
                          >
                            <MemberAvatar seed={member.id} name={member.name} image={member.image} size="sm" />
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
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </div>

          <div id="card-section-labels" className="flex items-start gap-3">
            <span className="w-20 shrink-0 pt-1.5 text-sm text-muted-foreground">
              Labels
            </span>
            <CardLabelsSection
              cardId={card.id}
              boardId={boardId}
              boardLabels={boardLabels}
              cardLabelIds={cardLabelIds}
              canEdit={canEdit}
            />
          </div>

          <div id="card-section-priority" className="flex items-center gap-3">
            <Label htmlFor="card-priority" className="w-20 shrink-0 text-sm font-normal text-muted-foreground">
              Priority
            </Label>
            <Select
              value={draftPriority}
              onValueChange={(value) => {
                setDraftPriority(value);
                setError("");
                queueSavePriority(value);
              }}
              disabled={!canEdit}
            >
              <SelectTrigger id="card-priority" className="w-full max-w-60">
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

          <div id="card-section-dates" className="flex items-center gap-3">
            <span id="card-due-date-label" className="w-20 shrink-0 text-sm text-muted-foreground">
              Due date
            </span>
            <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="card-due-date"
                  type="button"
                  variant="outline"
                  disabled={!canEdit}
                  aria-labelledby="card-due-date-label card-due-date"
                  aria-label={
                    selectedDueDate
                      ? `Due date: ${format(selectedDueDate, "PPP")}. Change due date`
                      : "Set due date"
                  }
                  className={cn(
                    "w-full max-w-60 justify-start text-left font-normal",
                    !selectedDueDate && "text-muted-foreground",
                  )}
                >
                  <HugeiconsIcon
                    icon={Calendar03Icon}
                    size={16}
                    strokeWidth={2}
                    className="mr-2 shrink-0"
                  />
                  {selectedDueDate ? format(selectedDueDate, "PPP") : "No due date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  autoFocus
                  selected={selectedDueDate}
                  defaultMonth={selectedDueDate}
                  onSelect={(date) => {
                    if (!date) {
                      return;
                    }
                    const next = toDueDateValue(date);
                    setDraftDueDate(next);
                    setError("");
                    queueSaveDueDate(next);
                    setDueDateOpen(false);
                  }}
                />
                {draftDueDate ? (
                  <div className="border-t p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center"
                      disabled={!canEdit}
                      onClick={() => {
                        setDraftDueDate("");
                        setError("");
                        queueSaveDueDate("");
                        setDueDateOpen(false);
                      }}
                    >
                      Clear due date
                    </Button>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="card-estimate-hours" className="w-20 shrink-0 text-sm font-normal text-muted-foreground">
              Estimate
            </Label>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Select
                value={draftEstimateHours === "" ? "none" : draftEstimateHours}
                onValueChange={(value) => {
                  const next = value === "none" ? "" : value;
                  setDraftEstimateHours(next);
                  setError("");
                  queueSaveEstimate(next);
                }}
                disabled={!canEdit}
              >
                <SelectTrigger id="card-estimate-hours" className="w-full max-w-40">
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
            </div>
          </div>
        </div>

        {/* Document body — hairline-divided sections (no boxed sub-cards).
            Description + comment body read at 16px / 1.55 leading. */}
        <section className="mt-6 space-y-3 border-t border-border pt-6">
          <h3 className="text-base font-semibold">Description</h3>

          {canEdit ? (
            <Textarea
              id="card-detail-description"
              value={draftDescription}
              onChange={(e) => {
                setDraftDescription(e.target.value);
                setError("");
              }}
              onFocus={() => setDescriptionEditing(true)}
              onBlur={() => {
                setDescriptionEditing(false);
                queueSaveDetails(draftTitle, draftDescription);
              }}
              rows={8}
              placeholder="Add a more detailed description..."
              className="min-h-40 text-base leading-[1.55] md:text-base"
            />
          ) : (
            <div className="min-h-[3rem] whitespace-pre-wrap text-base leading-[1.55]">
              {card.description || (
                <span className="text-muted-foreground">No description yet.</span>
              )}
            </div>
          )}
        </section>

        <div id="card-section-checklist" className="mt-6 border-t border-border pt-6">
          <CardChecklistsSection
            cardId={card.id}
            checklists={checklists}
            canEdit={canEdit}
          />
        </div>

        <section className="mt-6 space-y-4 border-t border-border pt-6">
          <h3 className="text-base font-semibold">Comments and activity</h3>

          <CommentComposer cardId={card.id} canComment={canComment} assignableMembers={assignableMembers} />

          {displayedComments.length === 0 && displayedActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No comments or activity yet. Start the conversation!
            </p>
          ) : (
            <div className="space-y-5">
              {displayedComments.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Comments</h4>
                  {displayedComments.map((comment) => (
                    <CommentItem key={comment.id} comment={comment} memberNames={assignableMembers.map((m) => m.name)} />
                  ))}
                  {commentsHasMoreState && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={loadMoreComments}
                      disabled={commentsPending}
                    >
                      {commentsPending ? "Loading..." : "Load more comments"}
                    </Button>
                  )}
                </div>
              )}

              {displayedActivity.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Activity</h4>
                  {displayedActivity.map((entry) => (
                    <ActivityItem key={entry.id} activity={entry} />
                  ))}
                  {activityHasMoreState && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={loadMoreActivity}
                      disabled={activityPending}
                    >
                      {activityPending ? "Loading..." : "Load more activity"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <div id="card-section-attachments" className="mt-6 border-t border-border pt-6">
          <CardAttachments
            cardId={card.id}
            attachments={attachments}
            canEdit={canEdit}
          />
        </div>
      </div>
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

  // Form submit path (submit button + Enter). A textarea does not implicitly
  // submit its form, so the textarea keydown handler below routes Enter here;
  // Shift+Enter stays a newline. When the mention list is open, Enter/Tab
  // select a mention instead — the hook preventDefaults, which also stops
  // submission, so a mention pick never posts the comment.
  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleSubmit();
  }

  function handleCommentKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !isMentionOpen) {
      event.preventDefault();
      handleSubmit();
      return;
    }
    // Delegate arrows/Enter/Escape to the mention combobox while its list is
    // open (and let plain typing fall through to the browser).
    mentionComboboxProps.onKeyDown?.(event);
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleFormSubmit} className="space-y-2">
        <Textarea
          ref={textareaRef}
          value={content}
          disabled={isPending || !canComment}
          rows={3}
          placeholder={canComment ? "Write a comment..." : "You do not have permission to comment on this card."}
          className="min-h-20"
          {...mentionComboboxProps}
          onKeyDown={handleCommentKeyDown}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {canComment && (
          <Button type="submit" disabled={isPending || !content.trim()}>
            {isPending ? "Posting..." : "Post comment"}
          </Button>
        )}
      </form>
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
                    <MemberAvatar seed={member.id} name={member.name} image={member.image} size="sm" />
                    <span className="flex-1 truncate">{member.name}</span>
                  </div>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type CommentItemProps = {
  comment: UIComment;
  memberNames: string[];
};

function renderMentionContent(content: string, memberNames: string[]) {
  if (!memberNames.length) return content;

  // Share the single mention resolver (lib/mention.ts) with the notify path so
  // what is highlighted and what is notified never diverge.
  const matches = resolveMentions(
    content,
    memberNames.map((name) => ({ name })),
  );
  if (!matches.length) return content;

  const result: React.ReactNode[] = [];
  let plainStart = 0;

  for (const match of matches) {
    if (match.start > plainStart) {
      result.push(content.slice(plainStart, match.start));
    }
    result.push(
      <span
        key={match.start}
        className="rounded bg-[var(--chart-2)]/10 px-0.5 font-medium text-[var(--chart-2)]"
      >
        @{match.member.name}
      </span>
    );
    plainStart = match.end;
  }

  if (plainStart < content.length) {
    result.push(content.slice(plainStart));
  }

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
    <div className="flex items-start gap-3">
      <MemberAvatar seed={comment.user.id} name={comment.user.name} image={comment.user.image} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{comment.user.name}</span>
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
        <p className="whitespace-pre-wrap text-base leading-[1.55]">
          {renderMentionContent(comment.content, memberNames)}
        </p>
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
    <div className="flex items-start gap-3">
      <MemberAvatar seed={activity.user.id} name={activity.user.name} image={activity.user.image} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          <span className="font-medium">{activity.user.name}</span> {actionLabel}
        </p>
        <p className="text-xs text-muted-foreground">{date}</p>
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
