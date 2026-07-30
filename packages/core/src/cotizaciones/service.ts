import { Decimal } from "decimal.js";
import { and, desc, eq, inArray } from "drizzle-orm";
import { calcularCotizacion } from "../cotizador/calcular.js";
import { ClienteNoEncontradoError } from "../clientes/errors.js";
import { obtenerConfiguracionCosteo } from "../configuracion/service.js";
import { clientes, cotizacionItems, cotizaciones, materiales } from "../db/schema.js";
import type { CotizacionEstado } from "../db/enums.js";
import type { Database } from "../db/types.js";
import { CotizacionNoEncontradaError, MaterialInexistenteError } from "./errors.js";
import {
  actualizarEstadoCotizacionInputSchema,
  crearCotizacionInputSchema,
  type CrearCotizacionInput,
} from "./schemas.js";

export async function crearCotizacion(db: Database, input: CrearCotizacionInput) {
  const data = crearCotizacionInputSchema.parse(input);

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, data.clienteId));
  if (!cliente) throw new ClienteNoEncontradoError(data.clienteId);

  const materialIds = data.items.map((item) => item.materialId);
  const materialesEncontrados = await db
    .select()
    .from(materiales)
    .where(inArray(materiales.id, materialIds));
  const materialesPorId = new Map(materialesEncontrados.map((m) => [m.id, m]));
  for (const item of data.items) {
    const material = materialesPorId.get(item.materialId);
    if (!material || !material.activo) throw new MaterialInexistenteError(item.materialId);
  }

  const configuracion = await obtenerConfiguracionCosteo(db);
  const tarifaManoObraHora = data.tarifaManoObraHora ?? configuracion?.tarifaManoObraHora ?? 0;
  const costoTransporte = data.costoTransporte ?? configuracion?.tarifaTransporteDefault ?? 0;
  const margenPct = data.margenPct ?? configuracion?.margenDefaultPct ?? 0;
  const horasManoObraEstimadas = data.horasManoObraEstimadas ?? 0;

  const calculo = calcularCotizacion({
    items: data.items.map((item) => ({
      materialId: item.materialId,
      cantidad: item.cantidad,
      // snapshot: el precio se congela con el costo del catálogo AHORA, no
      // con lo que el cliente haya podido enviar.
      costoUnitario: materialesPorId.get(item.materialId)!.costoUnitario,
    })),
    horasManoObraEstimadas,
    tarifaManoObraHora,
    costoTransporte,
    margenPct,
  });

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

export async function obtenerCotizacion(db: Database, id: number) {
  const [cotizacion] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!cotizacion) return null;
  const items = await db
    .select()
    .from(cotizacionItems)
    .where(eq(cotizacionItems.cotizacionId, id));
  return { ...cotizacion, items };
}

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
