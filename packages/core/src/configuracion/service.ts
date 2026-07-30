import { Decimal } from "decimal.js";
import { eq } from "drizzle-orm";
import { configuracionCosteo } from "../db/schema.js";
import type { Database } from "../db/types.js";
import { configuracionCosteoInputSchema, type ConfiguracionCosteoInput } from "./schemas.js";

export async function obtenerConfiguracionCosteo(db: Database) {
  const [row] = await db.select().from(configuracionCosteo).limit(1);
  return row ?? null;
}

// Fila única de configuración: la crea la primera vez que se guarda,
// después solo actualiza. Así el dueño del negocio edita tarifas desde el
// panel sin tocar código ni necesitar una migración de datos inicial.
export async function guardarConfiguracionCosteo(db: Database, input: ConfiguracionCosteoInput) {
  const data = configuracionCosteoInputSchema.parse(input);
  const valores = {
    tarifaManoObraHora: new Decimal(data.tarifaManoObraHora).toFixed(2),
    margenDefaultPct: new Decimal(data.margenDefaultPct).toFixed(2),
    tarifaTransporteDefault: new Decimal(data.tarifaTransporteDefault).toFixed(2),
    updatedAt: new Date(),
  };

  const existente = await obtenerConfiguracionCosteo(db);
  if (!existente) {
    const [row] = await db.insert(configuracionCosteo).values(valores).returning();
    return row!;
  }
  const [row] = await db
    .update(configuracionCosteo)
    .set(valores)
    .where(eq(configuracionCosteo.id, existente.id))
    .returning();
  return row!;
}
