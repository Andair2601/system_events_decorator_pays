import { Decimal } from "decimal.js";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../db/types.js";
import { materiales } from "../db/schema.js";
import { MaterialNoEncontradoError } from "./errors.js";
import {
  actualizarMaterialInputSchema,
  crearMaterialInputSchema,
  listarMaterialesOptionsSchema,
  type ActualizarMaterialInput,
  type CrearMaterialInput,
  type ListarMaterialesOptions,
} from "./schemas.js";

export async function crearMaterial(db: Database, input: CrearMaterialInput) {
  const data = crearMaterialInputSchema.parse(input);
  const [row] = await db
    .insert(materiales)
    .values({
      nombre: data.nombre,
      categoria: data.categoria,
      costoUnitario: new Decimal(data.costoUnitario).toFixed(2),
      unidad: data.unidad,
    })
    .returning();
  // INSERT ... RETURNING de una sola fila siempre devuelve exactamente una fila.
  return row!;
}

export async function listarMateriales(db: Database, opts: ListarMaterialesOptions = {}) {
  const { categoria, incluirInactivos } = listarMaterialesOptionsSchema.parse(opts);
  const condiciones = [];
  if (!incluirInactivos) condiciones.push(eq(materiales.activo, true));
  if (categoria) condiciones.push(eq(materiales.categoria, categoria));

  return db
    .select()
    .from(materiales)
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(asc(materiales.nombre));
}

export async function obtenerMaterial(db: Database, id: number) {
  const [row] = await db.select().from(materiales).where(eq(materiales.id, id));
  return row ?? null;
}

export async function actualizarMaterial(
  db: Database,
  id: number,
  input: ActualizarMaterialInput,
) {
  const data = actualizarMaterialInputSchema.parse(input);
  const updateValues: Partial<typeof materiales.$inferInsert> = { updatedAt: new Date() };
  if (data.nombre !== undefined) updateValues.nombre = data.nombre;
  if (data.categoria !== undefined) updateValues.categoria = data.categoria;
  if (data.costoUnitario !== undefined) {
    updateValues.costoUnitario = new Decimal(data.costoUnitario).toFixed(2);
  }
  if (data.unidad !== undefined) updateValues.unidad = data.unidad;

  const [row] = await db
    .update(materiales)
    .set(updateValues)
    .where(eq(materiales.id, id))
    .returning();
  if (!row) throw new MaterialNoEncontradoError(id);
  return row;
}

export async function desactivarMaterial(db: Database, id: number) {
  const [row] = await db
    .update(materiales)
    .set({ activo: false, updatedAt: new Date() })
    .where(eq(materiales.id, id))
    .returning();
  if (!row) throw new MaterialNoEncontradoError(id);
  return row;
}

export async function reactivarMaterial(db: Database, id: number) {
  const [row] = await db
    .update(materiales)
    .set({ activo: true, updatedAt: new Date() })
    .where(eq(materiales.id, id))
    .returning();
  if (!row) throw new MaterialNoEncontradoError(id);
  return row;
}
