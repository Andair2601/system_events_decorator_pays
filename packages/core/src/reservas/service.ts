import { Decimal } from "decimal.js";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { CotizacionNoAceptadaError, CotizacionNoEncontradaError } from "../cotizaciones/errors.js";
import { cotizacionItems, cotizaciones, materiales, reservaItems, reservas } from "../db/schema.js";
import type { ReservaEstado, ReservaEstadoPago } from "../db/enums.js";
import type { Database } from "../db/types.js";
import { ReservaItemFijoError, ReservaItemNoEncontradoError, ReservaNoEncontradaError } from "./errors.js";
import {
  actualizarEstadoReservaInputSchema,
  actualizarReservaItemInputSchema,
  agregarReservaItemInputSchema,
  crearReservaInputSchema,
  registrarPagoInputSchema,
  type ActualizarReservaItemInput,
  type AgregarReservaItemInput,
  type CrearReservaInput,
} from "./schemas.js";

// Copia (snapshot) los ítems de la cotización a la checklist de la reserva.
// Se llama tanto al crear la reserva como, de forma perezosa, la primera
// vez que se pide el detalle de una reserva que ya existía antes de esta
// tabla — así no hace falta un script de backfill aparte.
async function seedReservaItemsDesdeCotizacion(
  db: Database,
  reservaId: number,
  cotizacionId: number,
) {
  const items = await db
    .select({
      materialId: cotizacionItems.materialId,
      cantidad: cotizacionItems.cantidad,
      materialNombre: materiales.nombre,
    })
    .from(cotizacionItems)
    .innerJoin(materiales, eq(cotizacionItems.materialId, materiales.id))
    .where(eq(cotizacionItems.cotizacionId, cotizacionId));
  if (items.length === 0) return;

  await db.insert(reservaItems).values(
    items.map((item) => ({
      reservaId,
      materialId: item.materialId,
      descripcion: item.materialNombre,
      cantidad: item.cantidad,
      origen: "cotizacion" as const,
    })),
  );
}

// Regla de negocio actual: toda reserva nace de una cotización ya aceptada
// (ver decisión de esquema en cotizacion_id: nullable y sin UNIQUE a
// propósito, para no requerir una migración destructiva si esto cambia).
export async function crearReserva(db: Database, input: CrearReservaInput) {
  const data = crearReservaInputSchema.parse(input);

  const [cotizacion] = await db
    .select()
    .from(cotizaciones)
    .where(eq(cotizaciones.id, data.cotizacionId));
  if (!cotizacion) throw new CotizacionNoEncontradaError(data.cotizacionId);
  if (cotizacion.estado !== "aceptada") {
    throw new CotizacionNoAceptadaError(data.cotizacionId, cotizacion.estado);
  }

  const [row] = await db
    .insert(reservas)
    .values({
      cotizacionId: cotizacion.id,
      clienteId: cotizacion.clienteId,
      fechaEvento: data.fechaEvento,
      horaEvento: data.horaEvento,
      lugar: data.lugar,
      notas: data.notas,
    })
    .returning();
  const reserva = row!;
  await seedReservaItemsDesdeCotizacion(db, reserva.id, cotizacion.id);
  return reserva;
}

// El monto total y pendiente se derivan del precio_final de la cotización
// asociada (left join, porque cotizacion_id es nullable); se calculan acá
// con Decimal en vez de dejar que el front reste strings de NUMERIC.
function conMontos<T extends { montoPagado: string; montoTotal: string | null }>(row: T) {
  const montoPendiente = row.montoTotal
    ? Decimal.max(0, new Decimal(row.montoTotal).minus(row.montoPagado)).toFixed(2)
    : null;
  return { ...row, montoPendiente };
}

const columnasConTotal = {
  id: reservas.id,
  cotizacionId: reservas.cotizacionId,
  clienteId: reservas.clienteId,
  fechaEvento: reservas.fechaEvento,
  horaEvento: reservas.horaEvento,
  lugar: reservas.lugar,
  estado: reservas.estado,
  estadoPago: reservas.estadoPago,
  montoPagado: reservas.montoPagado,
  montoTotal: cotizaciones.precioFinal,
  calendarEventId: reservas.calendarEventId,
  notas: reservas.notas,
  createdAt: reservas.createdAt,
  updatedAt: reservas.updatedAt,
};

export async function obtenerReserva(db: Database, id: number) {
  const [row] = await db
    .select(columnasConTotal)
    .from(reservas)
    .leftJoin(cotizaciones, eq(reservas.cotizacionId, cotizaciones.id))
    .where(eq(reservas.id, id));
  return row ? conMontos(row) : null;
}

export interface ListarReservasOptions {
  desde?: string;
  hasta?: string;
  estado?: ReservaEstado;
}

export async function listarReservas(db: Database, opts: ListarReservasOptions = {}) {
  const condiciones = [];
  if (opts.desde) condiciones.push(gte(reservas.fechaEvento, opts.desde));
  if (opts.hasta) condiciones.push(lte(reservas.fechaEvento, opts.hasta));
  if (opts.estado) condiciones.push(eq(reservas.estado, opts.estado));

  const filas = await db
    .select(columnasConTotal)
    .from(reservas)
    .leftJoin(cotizaciones, eq(reservas.cotizacionId, cotizaciones.id))
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(asc(reservas.fechaEvento));

  return filas.map(conMontos);
}

export async function actualizarEstadoReserva(db: Database, id: number, estado: ReservaEstado) {
  actualizarEstadoReservaInputSchema.parse({ estado });
  const [row] = await db
    .update(reservas)
    .set({ estado, updatedAt: new Date() })
    .where(eq(reservas.id, id))
    .returning();
  if (!row) throw new ReservaNoEncontradaError(id);
  return row;
}

// Acumula el pago y deriva estado_pago comparando contra el precio_final de
// la cotización asociada, en vez de dejar que alguien lo marque a mano y se
// desincronice del monto real pagado.
export async function registrarPago(db: Database, reservaId: number, monto: number) {
  const { monto: montoValidado } = registrarPagoInputSchema.parse({ monto });

  const [reserva] = await db.select().from(reservas).where(eq(reservas.id, reservaId));
  if (!reserva) throw new ReservaNoEncontradaError(reservaId);

  let precioFinal: Decimal | null = null;
  if (reserva.cotizacionId) {
    const [cotizacion] = await db
      .select()
      .from(cotizaciones)
      .where(eq(cotizaciones.id, reserva.cotizacionId));
    if (cotizacion) precioFinal = new Decimal(cotizacion.precioFinal);
  }

  const nuevoMontoPagado = new Decimal(reserva.montoPagado).plus(montoValidado);
  let estadoPago: ReservaEstadoPago = "parcial";
  if (precioFinal && nuevoMontoPagado.gte(precioFinal)) {
    estadoPago = "pagado";
  }

  const [row] = await db
    .update(reservas)
    .set({
      montoPagado: nuevoMontoPagado.toFixed(2),
      estadoPago,
      updatedAt: new Date(),
    })
    .where(eq(reservas.id, reservaId))
    .returning();
  return row!;
}

// Borrado directo: nada más referencia reservas.id con "restrict"
// (album_fotos.reservaId es "set null", reserva_items.reservaId es
// "cascade"), así que no hace falta traducir errores de FK acá.
export async function eliminarReserva(db: Database, id: number) {
  const [row] = await db.delete(reservas).where(eq(reservas.id, id)).returning();
  if (!row) throw new ReservaNoEncontradaError(id);
  return row;
}

// Trae la reserva junto con la cotización asociada (si tiene) y su
// checklist de materiales, sembrando la checklist si todavía no existe
// (reservas creadas antes de esta feature).
export async function obtenerReservaDetalle(db: Database, id: number) {
  const reserva = await obtenerReserva(db, id);
  if (!reserva) return null;

  let cotizacion = null;
  if (reserva.cotizacionId) {
    const [c] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, reserva.cotizacionId));
    cotizacion = c ?? null;

    const [existente] = await db
      .select({ id: reservaItems.id })
      .from(reservaItems)
      .where(and(eq(reservaItems.reservaId, id), eq(reservaItems.origen, "cotizacion")))
      .limit(1);
    if (!existente) await seedReservaItemsDesdeCotizacion(db, id, reserva.cotizacionId);
  }

  const items = await db
    .select()
    .from(reservaItems)
    .where(eq(reservaItems.reservaId, id))
    .orderBy(asc(reservaItems.id));

  return { ...reserva, cotizacion, items };
}

export async function agregarReservaItemAdicional(
  db: Database,
  reservaId: number,
  input: AgregarReservaItemInput,
) {
  const data = agregarReservaItemInputSchema.parse(input);
  const [reserva] = await db.select().from(reservas).where(eq(reservas.id, reservaId));
  if (!reserva) throw new ReservaNoEncontradaError(reservaId);

  const [row] = await db
    .insert(reservaItems)
    .values({
      reservaId,
      descripcion: data.descripcion,
      cantidad: data.cantidad !== undefined ? new Decimal(data.cantidad).toFixed(2) : undefined,
      origen: "adicional",
    })
    .returning();
  return row!;
}

export async function actualizarReservaItem(
  db: Database,
  itemId: number,
  input: ActualizarReservaItemInput,
) {
  const data = actualizarReservaItemInputSchema.parse(input);
  const [row] = await db
    .update(reservaItems)
    .set({ completado: data.completado })
    .where(eq(reservaItems.id, itemId))
    .returning();
  if (!row) throw new ReservaItemNoEncontradoError(itemId);
  return row;
}

export async function eliminarReservaItem(db: Database, itemId: number) {
  const [existente] = await db.select().from(reservaItems).where(eq(reservaItems.id, itemId));
  if (!existente) throw new ReservaItemNoEncontradoError(itemId);
  if (existente.origen === "cotizacion") throw new ReservaItemFijoError(itemId);

  await db.delete(reservaItems).where(eq(reservaItems.id, itemId));
  return existente;
}
