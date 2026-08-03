import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestError } from "./utils/params.js";

// Content-Types permitidos para fotos del álbum; también determina la
// extensión del archivo en S3 (no se confía en el nombre que mande el cliente).
const CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

let cachedClient: S3Client | undefined;

// El Lambda está en una VPC aislada sin salida a internet (ver
// docs/infra.md), así que este cliente SOLO se usa para firmar URLs
// (getSignedUrl es una firma HMAC local, no hace ninguna llamada de red) —
// nunca para PutObject/GetObject/DeleteObject reales contra S3.
function getS3Client(): S3Client {
  if (!cachedClient) cachedClient = new S3Client({});
  return cachedClient;
}

export function extensionParaContentType(contentType: string): string {
  const ext = CONTENT_TYPES[contentType];
  if (!ext) {
    throw new BadRequestError(
      `Content-Type "${contentType}" no soportado. Tipos permitidos: ${Object.keys(CONTENT_TYPES).join(", ")}`,
    );
  }
  return ext;
}

export function buildFotoKey(contentType: string): string {
  return `fotos/${randomUUID()}.${extensionParaContentType(contentType)}`;
}

export interface PresignUploadUrlInput {
  bucket: string;
  key: string;
  contentType: string;
}

export async function presignUploadUrl({
  bucket,
  key,
  contentType,
}: PresignUploadUrlInput): Promise<string> {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(getS3Client(), command, { expiresIn: 300 });
}

export function buildPublicUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${key}`;
}
