import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema.js";
import type { Database } from "../db/types.js";

const migrationsFolder = fileURLToPath(new URL("../db/migrations", import.meta.url));

// Postgres real compilado a WASM, en memoria: corre las mismas migraciones
// que producción sin necesitar Docker/una instancia real levantada.
export async function createTestDb(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Database;
}
