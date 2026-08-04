import { Hono } from "hono";
import {
  actualizarEstadoReserva,
  actualizarReservaItem,
  agregarReservaItemAdicional,
  crearReserva,
  eliminarReserva,
  eliminarReservaItem,
  listarReservas,
  obtenerReserva,
  obtenerReservaDetalle,
  registrarPago,
  type Database,
  type ReservaEstado,
} from "@deco-eventos/core";
import { parseIdParam } from "../utils/params.js";

export function reservasRoutes(db: Database) {
  const app = new Hono();

  app.get("/", async (c) => {
    const desde = c.req.query("desde");
    const hasta = c.req.query("hasta");
    const estado = c.req.query("estado") as ReservaEstado | undefined;
    const reservas = await listarReservas(db, { desde, hasta, estado });
    return c.json(reservas);
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    const reserva = await crearReserva(db, body);
    return c.json(reserva, 201);
  });

  app.get("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const reserva = await obtenerReserva(db, id);
    if (!reserva) return c.json({ error: "Reserva no encontrada" }, 404);
    return c.json(reserva);
  });

  app.patch("/:id/estado", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = await c.req.json();
    const reserva = await actualizarEstadoReserva(db, id, body.estado);
    return c.json(reserva);
  });

  app.post("/:id/pagos", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = await c.req.json();
    const reserva = await registrarPago(db, id, body.monto);
    return c.json(reserva);
  });

  app.delete("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    await eliminarReserva(db, id);
    return c.body(null, 204);
  });

  app.get("/:id/detalle", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const detalle = await obtenerReservaDetalle(db, id);
    if (!detalle) return c.json({ error: "Reserva no encontrada" }, 404);
    return c.json(detalle);
  });

  app.post("/:id/items", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = await c.req.json();
    const item = await agregarReservaItemAdicional(db, id, body);
    return c.json(item, 201);
  });

  app.patch("/:id/items/:itemId", async (c) => {
    const itemId = parseIdParam(c.req.param("itemId"));
    const body = await c.req.json();
    const item = await actualizarReservaItem(db, itemId, body);
    return c.json(item);
  });

  app.delete("/:id/items/:itemId", async (c) => {
    const itemId = parseIdParam(c.req.param("itemId"));
    await eliminarReservaItem(db, itemId);
    return c.body(null, 204);
  });

  return app;
}
