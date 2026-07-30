import { Hono } from "hono";
import {
  actualizarMaterial,
  crearMaterial,
  desactivarMaterial,
  listarMateriales,
  obtenerMaterial,
  reactivarMaterial,
  type Database,
  type MaterialCategoria,
} from "@deco-eventos/core";
import { parseIdParam } from "../utils/params.js";

export function materialesRoutes(db: Database) {
  const app = new Hono();

  app.get("/", async (c) => {
    const categoria = c.req.query("categoria") as MaterialCategoria | undefined;
    const incluirInactivos = c.req.query("incluirInactivos") === "true";
    const materiales = await listarMateriales(db, { categoria, incluirInactivos });
    return c.json(materiales);
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    const material = await crearMaterial(db, body);
    return c.json(material, 201);
  });

  app.get("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const material = await obtenerMaterial(db, id);
    if (!material) return c.json({ error: "Material no encontrado" }, 404);
    return c.json(material);
  });

  app.patch("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = await c.req.json();
    const material = await actualizarMaterial(db, id, body);
    return c.json(material);
  });

  app.post("/:id/desactivar", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const material = await desactivarMaterial(db, id);
    return c.json(material);
  });

  app.post("/:id/reactivar", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const material = await reactivarMaterial(db, id);
    return c.json(material);
  });

  return app;
}
