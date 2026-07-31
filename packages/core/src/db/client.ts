import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import type { Database } from "./types.js";

let cachedClient: ReturnType<typeof postgres> | undefined;
let cachedDb: Database | undefined;

// Singleton reusado entre invocaciones "warm" de Lambda; pool chico a propósito
// para no agotar max_connections de un db.t4g.micro cuando escale la concurrencia.
export function getDb(): Database {
  if (!cachedDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no está definida");
    }
    const maxConnections = Number(process.env.DB_POOL_MAX ?? 2);
    // RDS exige SSL; el Postgres local de docker-compose no lo tiene
    // configurado, así que esto solo se activa donde el infra lo pide
    // (DB_SSL=require, seteado por infra/lib/deco-eventos-stack.ts).
    const ssl = process.env.DB_SSL === "require" ? "require" : undefined;
    cachedClient = postgres(connectionString, { max: maxConnections, ssl });
    cachedDb = drizzle(cachedClient, { schema });
  }
  return cachedDb;
}

export async function closeDb() {
  await cachedClient?.end();
  cachedClient = undefined;
  cachedDb = undefined;
}

export type { Database } from "./types.js";
