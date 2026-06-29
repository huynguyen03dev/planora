import { z } from "zod";

import { ATTACHMENT_MIME_TYPES, fileSchema } from "./file";

export const uploadAttachmentSchema = z.object({
  cardId: z.string().uuid({ message: "Invalid card ID" }),
  file: fileSchema(ATTACHMENT_MIME_TYPES),
});

export type UploadAttachmentInput = z.infer<typeof uploadAttachmentSchema>;
