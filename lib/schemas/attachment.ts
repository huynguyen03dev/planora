import { z } from "zod";

export const uploadAttachmentSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, "File cannot be empty")
    .refine((file) => file.size <= 50 * 1024 * 1024, "File size must be less than 50 MB")
    .refine(
      (file) => {
        const allowedMimeTypes = [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ];
        return allowedMimeTypes.includes(file.type);
      },
      "File type not allowed",
    ),
});

export type UploadAttachmentInput = z.infer<typeof uploadAttachmentSchema>;
