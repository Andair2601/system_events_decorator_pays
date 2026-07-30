import { Hono } from "hono";
import {
  actualizarEstadoCotizacion,
  crearCotizacion,
  listarCotizaciones,
  obtenerCotizacion,
  type CotizacionEstado,
  type Database,
} from "@deco-eventos/core";
import { parseIdParam } from "../utils/params.js";

export function cotizacionesRoutes(db: Database) {
  const app = new Hono();

  app.get("/", async (c) => {
    const clienteIdRaw = c.req.query("clienteId");
    const estado = c.req.query("estado") as CotizacionEstado | undefined;
    const cotizaciones = await listarCotizaciones(db, {
      clienteId: clienteIdRaw ? Number(clienteIdRaw) : undefined,
      estado,
    });
    return c.json(cotizaciones);
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    const cotizacion = await crearCotizacion(db, body);
    return c.json(cotizacion, 201);
  });

  app.get("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const cotizacion = await obtenerCotizacion(db, id);
    if (!cotizacion) return c.json({ error: "Cotización no encontrada" }, 404);
    return c.json(cotizacion);
  });

  app.patch("/:id/estado", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = await c.req.json();
    const cotizacion = await actualizarEstadoCotizacion(db, id, body.estado);
    return c.json(cotizacion);
  });

  return app;
}
