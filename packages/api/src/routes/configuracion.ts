import { Hono } from "hono";
import {
  guardarConfiguracionCosteo,
  obtenerConfiguracionCosteo,
  type Database,
} from "@deco-eventos/core";

export function configuracionRoutes(db: Database) {
  const app = new Hono();

  app.get("/", async (c) => {
    const configuracion = await obtenerConfiguracionCosteo(db);
    return c.json(configuracion);
  });

  app.put("/", async (c) => {
    const body = await c.req.json();
    const configuracion = await guardarConfiguracionCosteo(db, body);
    return c.json(configuracion);
  });

  return app;
}
