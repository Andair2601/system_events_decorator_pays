import { serve } from "@hono/node-server";
import { getDb } from "@deco-eventos/core";
import { createApp } from "./app.js";

const db = getDb();
const app = createApp(db);
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API escuchando en http://localhost:${info.port}`);
});
