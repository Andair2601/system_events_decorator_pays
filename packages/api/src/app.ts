import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Database } from "@deco-eventos/core";
import { handleError } from "./errors.js";
import { albumRoutes } from "./routes/album.js";
import { clientesRoutes } from "./routes/clientes.js";
import { configuracionRoutes } from "./routes/configuracion.js";
import { cotizacionesRoutes } from "./routes/cotizaciones.js";
import { materialesRoutes } from "./routes/materiales.js";
import { reservasRoutes } from "./routes/reservas.js";
import { uploadsRoutes } from "./routes/uploads.js";

// db se inyecta en vez de crearse acá adentro: así el mismo app.ts sirve
// para el servidor local (postgres-js), los tests (pglite) y, más adelante,
// el handler de Lambda (packages/infra), sin duplicar rutas.
export function createApp(db: Database) {
  const app = new Hono();

  app.use("*", cors());
  app.onError(handleError);

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/materiales", materialesRoutes(db));
  app.route("/clientes", clientesRoutes(db));
  app.route("/configuracion", configuracionRoutes(db));
  app.route("/cotizaciones", cotizacionesRoutes(db));
  app.route("/reservas", reservasRoutes(db));
  app.route("/album", albumRoutes(db));
  app.route("/uploads", uploadsRoutes());

  return app;
}

export type App = ReturnType<typeof createApp>;
