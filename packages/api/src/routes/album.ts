import { Hono } from "hono";
import {
  actualizarFoto,
  crearFoto,
  eliminarFoto,
  listarFotos,
  obtenerFoto,
  type Database,
  type TipoEvento,
} from "@deco-eventos/core";
import { buildFotoKey, buildPublicUrl, presignUploadUrl } from "../s3.js";
import { BadRequestError, parseIdParam } from "../utils/params.js";

function getFotosConfig() {
  const bucket = process.env.ALBUM_FOTOS_BUCKET;
  const baseUrl = process.env.ALBUM_FOTOS_BASE_URL;
  if (!bucket || !baseUrl) {
    throw new Error("ALBUM_FOTOS_BUCKET / ALBUM_FOTOS_BASE_URL no están definidas");
  }
  return { bucket, baseUrl };
}

export function albumRoutes(db: Database) {
  const app = new Hono();

  // Solo firma la URL de subida (operación local, sin llamar a S3 por red);
  // el navegador hace el PUT real directo a S3. Ver docs/infra.md.
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

  app.get("/", async (c) => {
    const categoria = c.req.query("categoria") as TipoEvento | undefined;
    const destacadaRaw = c.req.query("destacada");
    const destacada = destacadaRaw === undefined ? undefined : destacadaRaw === "true";
    const reservaIdRaw = c.req.query("reservaId");
    const reservaId = reservaIdRaw ? Number(reservaIdRaw) : undefined;
    const fotos = await listarFotos(db, { categoria, destacada, reservaId });
    return c.json(fotos);
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    const foto = await crearFoto(db, body);
    return c.json(foto, 201);
  });

  app.get("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const foto = await obtenerFoto(db, id);
    if (!foto) return c.json({ error: "Foto no encontrada" }, 404);
    return c.json(foto);
  });

  app.patch("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = await c.req.json();
    const foto = await actualizarFoto(db, id, body);
    return c.json(foto);
  });

  app.delete("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    await eliminarFoto(db, id);
    return c.body(null, 204);
  });

  return app;
}
