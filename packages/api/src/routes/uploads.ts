import { Hono } from "hono";
import { buildFotoKey, buildPublicUrl, presignUploadUrl } from "../s3.js";
import { BadRequestError } from "../utils/params.js";

function getFotosConfig() {
  const bucket = process.env.FOTOS_BUCKET;
  const baseUrl = process.env.FOTOS_BASE_URL;
  if (!bucket || !baseUrl) {
    throw new Error("FOTOS_BUCKET / FOTOS_BASE_URL no están definidas");
  }
  return { bucket, baseUrl };
}

// Genérico, no atado a álbum ni a materiales: cualquier feature que
// necesite subir una imagen (álbum, foto de material, etc.) pide acá una
// URL prefirmada y sube el archivo directo a S3. Solo firma la URL
// (operación local, sin llamar a S3 por red); ver docs/infra.md.
export function uploadsRoutes() {
  const app = new Hono();

  app.post("/upload-url", async (c) => {
    const body = await c.req.json();
    const contentType = body.contentType;
    if (typeof contentType !== "string") {
      throw new BadRequestError("contentType es obligatorio");
    }
    const { bucket, baseUrl } = getFotosConfig();
    const s3Key = buildFotoKey(contentType);
    const uploadUrl = await presignUploadUrl({ bucket, key: s3Key, contentType });
    const publicUrl = buildPublicUrl(baseUrl, s3Key);
    return c.json({ uploadUrl, s3Key, publicUrl });
  });

  return app;
}
