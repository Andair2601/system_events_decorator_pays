import { Decimal } from "decimal.js";
import { and, desc, eq, inArray } from "drizzle-orm";
import { calcularCotizacion } from "../cotizador/calcular.js";
import { ClienteNoEncontradoError } from "../clientes/errors.js";
import { obtenerConfiguracionCosteo } from "../configuracion/service.js";
import { clientes, cotizacionItems, cotizaciones, materiales } from "../db/schema.js";
import type { CotizacionEstado } from "../db/enums.js";
import type { Database } from "../db/types.js";
import {
  CotizacionNoEditableError,
  CotizacionNoEncontradaError,
  MaterialInexistenteError,
} from "./errors.js";
import {
  actualizarCotizacionInputSchema,
  actualizarEstadoCotizacionInputSchema,
  crearCotizacionInputSchema,
  type ActualizarCotizacionInput,
  type CotizacionItemEntrada,
  type CrearCotizacionInput,
} from "./schemas.js";

interface OpcionesCosteo {
  horasManoObraEstimadas?: number;
  tarifaManoObraHora?: number;
  costoTransporte?: number;
  margenPct?: number;
  descuentoMonto?: number;
}

// Compartido entre crear y editar: valida que los materiales existan/estén
// activos, completa lo que falte con configuracion_costeo, y corre el
// motor de cotización. El costo unitario SIEMPRE se resuelve del catálogo
// en este momento (snapshot), nunca de lo que mande el caller.
async function calcularConMateriales(
  db: Database,
  items: CotizacionItemEntrada[],
  opciones: OpcionesCosteo,
) {
  const materialIds = items.map((item) => item.materialId);
  const materialesEncontrados = await db
    .select()
    .from(materiales)
    .where(inArray(materiales.id, materialIds));
  const materialesPorId = new Map(materialesEncontrados.map((m) => [m.id, m]));
  for (const item of items) {
    const material = materialesPorId.get(item.materialId);
    if (!material || !material.activo) throw new MaterialInexistenteError(item.materialId);
  }

  const configuracion = await obtenerConfiguracionCosteo(db);
  const horasManoObraEstimadas = opciones.horasManoObraEstimadas ?? 0;
  const tarifaManoObraHora = opciones.tarifaManoObraHora ?? configuracion?.tarifaManoObraHora ?? 0;
  const costoTransporte = opciones.costoTransporte ?? configuracion?.tarifaTransporteDefault ?? 0;
  const margenPct = opciones.margenPct ?? configuracion?.margenDefaultPct ?? 0;
  const descuentoMonto = opciones.descuentoMonto ?? 0;

  const calculo = calcularCotizacion({
    items: items.map((item) => ({
      materialId: item.materialId,
      cantidad: item.cantidad,
      costoUnitario: materialesPorId.get(item.materialId)!.costoUnitario,
    })),
    horasManoObraEstimadas,
    tarifaManoObraHora,
    costoTransporte,
    margenPct,
    descuentoMonto,
  });

  return { calculo, horasManoObraEstimadas };
}

export async function crearCotizacion(db: Database, input: CrearCotizacionInput) {
  const data = crearCotizacionInputSchema.parse(input);

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, data.clienteId));
  if (!cliente) throw new ClienteNoEncontradoError(data.clienteId);

  const { calculo, horasManoObraEstimadas } = await calcularConMateriales(db, data.items, data);

  return db.transaction(async (tx) => {
    const [cotizacion] = await tx
      .insert(cotizaciones)
      .values({
        clienteId: data.clienteId,
        nombreEvento: data.nombreEvento,
        tipoEvento: data.tipoEvento,
        imagenReferenciaUrl: data.imagenReferenciaUrl,
        horasManoObraEstimadas: new Decimal(horasManoObraEstimadas).toFixed(2),
        costoManoObra: calculo.costoManoObra,
        costoTransporte: calculo.costoTransporte,
        margenPctAplicado: calculo.margenPctAplicado,
        costoMaterialesTotal: calculo.costoMaterialesTotal,
        descuentoMonto: calculo.descuentoMonto,
        precioFinal: calculo.precioFinal,
        origen: data.origen,
      })
      .returning();
    const cotizacionRow = cotizacion!;

    const items = await tx
      .insert(cotizacionItems)
      .values(
        calculo.items.map((item) => ({
          cotizacionId: cotizacionRow.id,
          materialId: item.materialId,
          cantidad: item.cantidad,
          costoUnitarioSnapshot: item.costoUnitarioSnapshot,
          subtotal: item.subtotal,
        })),
      )
      .returning();

    return { ...cotizacionRow, items };
  });
}

// Solo permitido en estado "borrador": una vez enviada/aceptada, el precio
// no debe cambiar por debajo del cliente (ver CotizacionNoEditableError).
// Reemplaza los items existentes (no hace merge) y recalcula todo desde
// cero, igual que crearCotizacion.
export async function actualizarCotizacion(
  db: Database,
  id: number,
  input: ActualizarCotizacionInput,
) {
  const data = actualizarCotizacionInputSchema.parse(input);

  const [existente] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!existente) throw new CotizacionNoEncontradaError(id);
  if (existente.estado !== "borrador") {
    throw new CotizacionNoEditableError(id, existente.estado);
  }

  const { calculo, horasManoObraEstimadas } = await calcularConMateriales(db, data.items, data);

  return db.transaction(async (tx) => {
    const [cotizacion] = await tx
      .update(cotizaciones)
      .set({
        nombreEvento: data.nombreEvento,
        tipoEvento: data.tipoEvento,
        imagenReferenciaUrl: data.imagenReferenciaUrl,
        horasManoObraEstimadas: new Decimal(horasManoObraEstimadas).toFixed(2),
        costoManoObra: calculo.costoManoObra,
        costoTransporte: calculo.costoTransporte,
        margenPctAplicado: calculo.margenPctAplicado,
        costoMaterialesTotal: calculo.costoMaterialesTotal,
        descuentoMonto: calculo.descuentoMonto,
        precioFinal: calculo.precioFinal,
        updatedAt: new Date(),
      })
      .where(eq(cotizaciones.id, id))
      .returning();
    const cotizacionRow = cotizacion!;

    await tx.delete(cotizacionItems).where(eq(cotizacionItems.cotizacionId, id));

    const items = await tx
      .insert(cotizacionItems)
      .values(
        calculo.items.map((item) => ({
          cotizacionId: id,
          materialId: item.materialId,
          cantidad: item.cantidad,
          costoUnitarioSnapshot: item.costoUnitarioSnapshot,
          subtotal: item.subtotal,
        })),
      )
      .returning();

    return { ...cotizacionRow, items };
  });
}

export async function obtenerCotizacion(db: Database, id: number) {
  const [cotizacion] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cotizacion) return null;
  const items = await db
    .select()
    .from(cotizacionItems)
    .where(eq(cotizacionItems.cotizacionId, id));
  return { ...cotizacion, items };
}

// Pensado para generar documentos (PDF hoy, email/WhatsApp en fases
// posteriores): trae la cotización con el cliente y el nombre/unidad de
// cada material, sin depender de llamadas adicionales desde quien la usa.
export async function obtenerCotizacionCompleta(db: Database, id: number) {
  const [cotizacion] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cotizacion) return null;

  // clienteId es NOT NULL con FK "restrict", así que el cliente siempre existe.
  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, cotizacion.clienteId));

  const items = await db
    .select({
      id: cotizacionItems.id,
      materialId: cotizacionItems.materialId,
      materialNombre: materiales.nombre,
      materialUnidad: materiales.unidad,
      cantidad: cotizacionItems.cantidad,
      costoUnitarioSnapshot: cotizacionItems.costoUnitarioSnapshot,
      subtotal: cotizacionItems.subtotal,
    })
    .from(cotizacionItems)
    .innerJoin(materiales, eq(cotizacionItems.materialId, materiales.id))
    .where(eq(cotizacionItems.cotizacionId, id));

  return { ...cotizacion, cliente: cliente!, items };
}

export type CotizacionCompleta = NonNullable<
  Awaited<ReturnType<typeof obtenerCotizacionCompleta>>
>;

export interface ListarCotizacionesOptions {
  clienteId?: number;
  estado?: CotizacionEstado;
}

export async function listarCotizaciones(db: Database, opts: ListarCotizacionesOptions = {}) {
  const condiciones = [];
  if (opts.clienteId) condiciones.push(eq(cotizaciones.clienteId, opts.clienteId));
  if (opts.estado) condiciones.push(eq(cotizaciones.estado, opts.estado));

  return db
    .select()
    .from(cotizaciones)
    .where(condiciones.length ? and(...condiciones) : undefined)
    .orderBy(desc(cotizaciones.createdAt));
}

export async function actualizarEstadoCotizacion(
  db: Database,
  id: number,
  estado: CotizacionEstado,
) {
  actualizarEstadoCotizacionInputSchema.parse({ estado });
  const [row] = await db
    .update(cotizaciones)
    .set({ estado, updatedAt: new Date() })
    .where(eq(cotizaciones.id, id))
    .returning();
  if (!row) throw new CotizacionNoEncontradaError(id);
  return row;
}
