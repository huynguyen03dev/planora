import "server-only";

import { v2 as cloudinary } from "cloudinary";

import { ATTACHMENT_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/schemas/file";

/**
 * Cloudinary integration for file uploads.
 * Stores metadata about uploaded files and manages upload requests.
 *
 * MVP: Server-side signed uploads from Next.js Server Actions.
 * Future: Can support direct client uploads with signed URLs.
 */

export type CloudinaryUploadConfig = {
  cloudName: string;
  uploadPreset: string;
  apiKey: string;
  apiSecret: string;
};

export function getCloudinaryConfig(): CloudinaryUploadConfig {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !uploadPreset || !apiKey || !apiSecret) {
    throw new Error("Missing Cloudinary configuration");
  }

  return { cloudName, uploadPreset, apiKey, apiSecret };
}

export type CloudinaryUploadResponse = {
  publicId: string;
  resourceType: string;
  secureUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

/**
 * Validate file before upload to Cloudinary.
 * MVP validation: file exists, not empty, size limit, allowed MIME types.
 */
export function validateFileForUpload(
  file: File,
): { valid: true } | { valid: false; error: string } {
  if (!file) {
    return { valid: false, error: "File is required" };
  }

  if (file.size === 0) {
    return { valid: false, error: "File cannot be empty" };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `File size must be less than 50 MB` };
  }

  if (!ATTACHMENT_MIME_TYPES.includes(file.type as (typeof ATTACHMENT_MIME_TYPES)[number])) {
    return {
      valid: false,
      error: `File type not allowed. Supported: ${ATTACHMENT_MIME_TYPES.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Parse Cloudinary upload response and extract metadata.
 * This is called after a successful Cloudinary API response.
 */
export function parseCloudinaryResponse(response: Record<string, unknown>): CloudinaryUploadResponse {
  return {
    publicId: String(response.public_id),
    resourceType: String(response.resource_type),
    secureUrl: String(response.secure_url),
    fileName: String(response.original_filename),
    fileSize: Number(response.bytes),
    mimeType: String(response.format || response.resource_type),
  };
}

export type UploadToCloudinaryParams = {
  file: File;
  folder?: string;
};

export async function uploadToCloudinary({
  file,
  folder = "planora",
}: UploadToCloudinaryParams): Promise<CloudinaryUploadResponse> {
  const config = getCloudinaryConfig();

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        use_filename: true,
        unique_filename: true,
      },
      (error, uploadResult) => {
        if (error) {
          reject(error);
          return;
        }

        if (!uploadResult) {
          reject(new Error("Cloudinary upload returned no result"));
          return;
        }

        resolve(uploadResult as Record<string, unknown>);
      },
    );

    uploadStream.end(buffer);
  });

  return parseCloudinaryResponse(result);
}
