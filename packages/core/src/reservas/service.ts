import { Decimal } from "decimal.js";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { CotizacionNoAceptadaError, CotizacionNoEncontradaError } from "../cotizaciones/errors.js";
import { cotizaciones, reservas } from "../db/schema.js";
import type { ReservaEstado, ReservaEstadoPago } from "../db/enums.js";
import type { Database } from "../db/types.js";
import { ReservaNoEncontradaError } from "./errors.js";
import {
  actualizarEstadoReservaInputSchema,
  crearReservaInputSchema,
  registrarPagoInputSchema,
  type CrearReservaInput,
} from "./schemas.js";

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
  return row!;
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
