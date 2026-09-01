import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida");
  }
  // RDS/Supabase exigen SSL; el Postgres local de docker-compose no.
  const ssl = process.env.DB_SSL === "require" ? "require" : undefined;
  const client = postgres(connectionString, { max: 1, ssl });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  await client.end();
  console.log("Migraciones aplicadas correctamente");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
