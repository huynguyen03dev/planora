import { z } from "zod";

/**
 * Shared file-upload validation building blocks.
 *
 * Card covers accept images only; generic attachments also accept documents.
 * Both share the same size cap and the image MIME set, so those live here once
 * instead of being copy-pasted across `card.ts`, `attachment.ts`, and
 * `lib/cloudinary.ts` (where they previously drifted independently).
 */

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const ATTACHMENT_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/**
 * A Zod schema for an uploaded `File`: non-empty, within the size cap, and one
 * of `allowedMimeTypes`. Pass a custom `mimeError` to tailor the rejection copy.
 */
export function fileSchema(
  allowedMimeTypes: readonly string[],
  mimeError = "File type not allowed",
) {
  return z
    .instanceof(File)
    .refine((file) => file.size > 0, "File cannot be empty")
    .refine(
      (file) => file.size <= MAX_FILE_SIZE_BYTES,
      "File size must be less than 50 MB",
    )
    .refine((file) => allowedMimeTypes.includes(file.type), mimeError);
}
