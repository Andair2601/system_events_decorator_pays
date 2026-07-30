import { Hono } from "hono";
import {
  actualizarCliente,
  crearCliente,
  listarClientes,
  obtenerCliente,
  type Database,
} from "@deco-eventos/core";
import { parseIdParam } from "../utils/params.js";

export function clientesRoutes(db: Database) {
  const app = new Hono();

  app.get("/", async (c) => c.json(await listarClientes(db)));

  app.post("/", async (c) => {
    const body = await c.req.json();
    const cliente = await crearCliente(db, body);
    return c.json(cliente, 201);
  });

  app.get("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const cliente = await obtenerCliente(db, id);
    if (!cliente) return c.json({ error: "Cliente no encontrado" }, 404);
    return c.json(cliente);
  });

  app.patch("/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const body = await c.req.json();
    const cliente = await actualizarCliente(db, id, body);
    return c.json(cliente);
  });

  return app;
}
