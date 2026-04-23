"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadAttachmentAction } from "@/app/(authenticated)/(dashboard)/boards/[boardId]/actions";
import { Button } from "@/components/ui/button";
import type { AttachmentRecord } from "@/lib/attachment";

type CardAttachmentsProps = {
  cardId: string;
  attachments: AttachmentRecord[];
  canEdit: boolean;
};

export function CardAttachments({
  cardId,
  attachments,
  canEdit,
}: CardAttachmentsProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");

    const formData = new FormData();
    formData.set("cardId", cardId);
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadAttachmentAction(formData);
      if (!result.success) {
        setError(result.error);
      } else {
        router.refresh();
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Attachments</h3>
        <span className="text-xs text-muted-foreground">
          {canEdit ? "Upload and manage" : "View only"}
        </span>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {attachments.length === 0 ? (
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">
            No attachments yet.
            {canEdit && " Upload files to share with your team."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <AttachmentItem key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            disabled={isPending}
            className="hidden"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={handleFileClick}
          >
            {isPending ? "Uploading..." : "Upload attachment"}
          </Button>
        </div>
      )}
    </section>
  );
}

type AttachmentItemProps = {
  attachment: AttachmentRecord;
};

function AttachmentItem({ attachment }: AttachmentItemProps) {
  const date = new Date(attachment.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const fileSize = (attachment.fileSize / 1024).toFixed(1);

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a
              href={attachment.fileUrl}
              download={attachment.fileName}
              className="truncate font-medium text-primary hover:underline text-sm"
            >
              {attachment.fileName}
            </a>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{fileSize} KB</span>
            <span>•</span>
            <span>{attachment.user.name}</span>
            <span>•</span>
            <span>{date}</span>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          asChild
        >
          <a href={attachment.fileUrl} download={attachment.fileName}>
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}
