import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Invocado a mano (aws lambda invoke) después de un deploy que trae
// cambios de esquema; no corre automáticamente en cada `cdk deploy`.
// Ver docs/infra.md para la decisión de por qué no está automatizado.
export async function handler() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida");
  }
  const ssl = process.env.DB_SSL === "require" ? "require" : undefined;
  const client = postgres(connectionString, { max: 1, ssl });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./migrations" });
    return { ok: true };
  } catch (err) {
    // Se re-lanza como un Error con el detalle serializado en el mensaje
    // (no solo loggeado) porque el mensaje es lo único que se puede leer
    // directamente desde la respuesta de `aws lambda invoke`, sin
    // necesitar permisos de lectura de CloudWatch Logs. Se buscan las
    // propiedades a mano (no Object.entries) porque en PostgresError
    // varias no son enumerables.
    const cause = (err as { cause?: Record<string, unknown> })?.cause;
    const detalle = {
      message: err instanceof Error ? err.message : String(err),
      causeMessage: cause && typeof cause === "object" ? (cause as any).message : undefined,
      causeCode: cause?.code,
      causeDetail: cause?.detail,
      causeHint: cause?.hint,
      // Sin exponer el password: solo para confirmar que la referencia
      // dinámica de CloudFormation se resolvió a un valor real y no quedó
      // como el texto literal "{{resolve:secretsmanager:...}}".
      connMask: connectionString.replace(/:[^:@/]*@/, ":***@"),
    };
    throw new Error(JSON.stringify(detalle));
  } finally {
    await client.end();
  }
}
