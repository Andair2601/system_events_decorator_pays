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
import { parseIdParam } from "../utils/params.js";

export function albumRoutes(db: Database) {
  const app = new Hono();

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
