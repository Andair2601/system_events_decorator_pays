import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let cachedClient: ReturnType<typeof postgres> | undefined;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

// Singleton reusado entre invocaciones "warm" de Lambda; pool chico a propósito
// para no agotar max_connections de un db.t4g.micro cuando escale la concurrencia.
export function getDb() {
  if (!cachedDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no está definida");
    }
    const maxConnections = Number(process.env.DB_POOL_MAX ?? 2);
    cachedClient = postgres(connectionString, { max: maxConnections });
    cachedDb = drizzle(cachedClient, { schema });
  }
  return cachedDb;
}

export async function closeDb() {
  await cachedClient?.end();
  cachedClient = undefined;
  cachedDb = undefined;
}

export type Database = ReturnType<typeof getDb>;
