import { handle } from "hono/aws-lambda";
import { getDb } from "@deco-eventos/core";
import { createApp } from "./app.js";

// Fuera del handler para reutilizar la conexión (y el pool de postgres)
// entre invocaciones "warm" de la misma instancia de Lambda.
const db = getDb();
const app = createApp(db);

export const handler = handle(app);
