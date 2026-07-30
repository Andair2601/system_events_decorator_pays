import { asc, eq } from "drizzle-orm";
import { clientes } from "../db/schema.js";
import type { Database } from "../db/types.js";
import { ClienteNoEncontradoError } from "./errors.js";
import {
  actualizarClienteInputSchema,
  crearClienteInputSchema,
  type ActualizarClienteInput,
  type CrearClienteInput,
} from "./schemas.js";

export async function crearCliente(db: Database, input: CrearClienteInput) {
  const data = crearClienteInputSchema.parse(input);
  const [row] = await db.insert(clientes).values(data).returning();
  return row!;
}

export async function listarClientes(db: Database) {
  return db.select().from(clientes).orderBy(asc(clientes.nombre));
}

export async function obtenerCliente(db: Database, id: number) {
  const [row] = await db.select().from(clientes).where(eq(clientes.id, id));
  return row ?? null;
}

export async function obtenerClientePorTelefono(db: Database, telefono: string) {
  const [row] = await db.select().from(clientes).where(eq(clientes.telefono, telefono));
  return row ?? null;
}

// Pensado para el futuro agente de WhatsApp (Fase 4): busca por teléfono y
// crea el cliente si todavía no existe, para no duplicar clientes por
// pequeñas variaciones de nombre entre conversaciones.
export async function obtenerOCrearClientePorTelefono(
  db: Database,
  input: { telefono: string; nombre: string; email?: string },
) {
  const existente = await obtenerClientePorTelefono(db, input.telefono);
  if (existente) return existente;
  return crearCliente(db, { telefono: input.telefono, nombre: input.nombre, email: input.email });
}

export async function actualizarCliente(db: Database, id: number, input: ActualizarClienteInput) {
  const data = actualizarClienteInputSchema.parse(input);
  const [row] = await db
    .update(clientes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(clientes.id, id))
    .returning();
  if (!row) throw new ClienteNoEncontradoError(id);
  return row;
}
