import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db/types.js";
import { albumFotos, reservas } from "../db/schema.js";
import { ReservaNoEncontradaError } from "../reservas/errors.js";
import { AlbumFotoNoEncontradaError } from "./errors.js";
import {
  actualizarFotoInputSchema,
  crearFotoInputSchema,
  listarFotosOptionsSchema,
  type ActualizarFotoInput,
  type CrearFotoInput,
  type ListarFotosOptions,
} from "./schemas.js";

async function verificarReservaExiste(db: Database, reservaId: number) {
  const [reserva] = await db.select().from(reservas).where(eq(reservas.id, reservaId));
  if (!reserva) throw new ReservaNoEncontradaError(reservaId);
}

export async function crearFoto(db: Database, input: CrearFotoInput) {
  const data = crearFotoInputSchema.parse(input);
  if (data.reservaId !== undefined) await verificarReservaExiste(db, data.reservaId);

  const [row] = await db
    .insert(albumFotos)
    .values({
      categoria: data.categoria,
      reservaId: data.reservaId,
      s3Key: data.s3Key,
      url: data.url,
      destacada: data.destacada,
    })
    .returning();
  return row!;
}

export async function listarFotos(db: Database, opts: ListarFotosOptions = {}) {
  const { categoria, destacada, reservaId } = listarFotosOptionsSchema.parse(opts);
  const condiciones = [];
  if (categoria) condiciones.push(eq(albumFotos.categoria, categoria));
  if (destacada !== undefined) condiciones.push(eq(albumFotos.destacada, destacada));
  if (reservaId) condiciones.push(eq(albumFotos.reservaId, reservaId));

  return db
    .select()
    .from(albumFotos)
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(albumFotos.createdAt));
}

export async function obtenerFoto(db: Database, id: number) {
  const [row] = await db.select().from(albumFotos).where(eq(albumFotos.id, id));
  return row ?? null;
}

export async function actualizarFoto(db: Database, id: number, input: ActualizarFotoInput) {
  const data = actualizarFotoInputSchema.parse(input);
  if (data.reservaId !== undefined && data.reservaId !== null) {
    await verificarReservaExiste(db, data.reservaId);
  }

  const updateValues: Partial<typeof albumFotos.$inferInsert> = {};
  if (data.categoria !== undefined) updateValues.categoria = data.categoria;
  if (data.reservaId !== undefined) updateValues.reservaId = data.reservaId;
  if (data.destacada !== undefined) updateValues.destacada = data.destacada;

  const [row] = await db
    .update(albumFotos)
    .set(updateValues)
    .where(eq(albumFotos.id, id))
    .returning();
  if (!row) throw new AlbumFotoNoEncontradaError(id);
  return row;
}

// Solo borra la fila: el objeto en S3 queda huérfano a propósito (el
// Lambda de la API está en una VPC aislada sin salida a internet, así que
// no puede llamar a S3 para borrarlo; ver docs/infra.md).
export async function eliminarFoto(db: Database, id: number) {
  const [row] = await db.delete(albumFotos).where(eq(albumFotos.id, id)).returning();
  if (!row) throw new AlbumFotoNoEncontradaError(id);
  return row;
}
