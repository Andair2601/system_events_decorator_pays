import { Decimal } from "decimal.js";
import { z } from "zod";
import { DescuentoInvalidoError } from "./errors.js";

const montoSchema = z.union([z.number(), z.string()]);

export const cotizacionItemInputSchema = z.object({
  materialId: z.number().int().positive(),
  cantidad: montoSchema,
  // Snapshot del costo del material al momento de cotizar: lo resuelve el
  // caller (servicio de catálogo), no se busca aquí para mantener esta
  // función pura y testeable sin base de datos.
  costoUnitario: montoSchema,
});
export type CotizacionItemInput = z.infer<typeof cotizacionItemInputSchema>;

export const calcularCotizacionInputSchema = z.object({
  items: z.array(cotizacionItemInputSchema).min(1, "La cotización necesita al menos un material"),
  horasManoObraEstimadas: montoSchema.default(0),
  tarifaManoObraHora: montoSchema,
  costoTransporte: montoSchema.default(0),
  margenPct: montoSchema,
  descuentoMonto: montoSchema.default(0),
});
// z.input (no z.infer/z.output): horasManoObraEstimadas y costoTransporte
// tienen .default(), así que deben quedar opcionales en el tipo de entrada
// aunque zod los complete a required internamente al parsear.
export type CalcularCotizacionInput = z.input<typeof calcularCotizacionInputSchema>;

export interface CotizacionItemCalculado {
  materialId: number;
  cantidad: string;
  costoUnitarioSnapshot: string;
  subtotal: string;
}

export interface CotizacionCalculada {
  items: CotizacionItemCalculado[];
  costoMaterialesTotal: string;
  costoManoObra: string;
  costoTransporte: string;
  margenPctAplicado: string;
  /** materiales + mano de obra + transporte, antes de aplicar margen */
  baseCosto: string;
  margenMonto: string;
  descuentoMonto: string;
  precioFinal: string;
}

export function calcularCotizacion(input: CalcularCotizacionInput): CotizacionCalculada {
  const parsed = calcularCotizacionInputSchema.parse(input);

  const items = parsed.items.map((item) => {
    const cantidad = new Decimal(item.cantidad);
    const costoUnitario = new Decimal(item.costoUnitario);
    if (!cantidad.isPositive()) {
      throw new Error(`La cantidad del material ${item.materialId} debe ser mayor a 0`);
    }
    if (costoUnitario.isNegative()) {
      throw new Error(`El costo unitario del material ${item.materialId} no puede ser negativo`);
    }
    const subtotal = cantidad.times(costoUnitario);
    return {
      materialId: item.materialId,
      cantidad: cantidad.toFixed(2),
      costoUnitarioSnapshot: costoUnitario.toFixed(2),
      subtotal: subtotal.toFixed(2),
    };
  });

  const costoMaterialesTotal = items.reduce(
    (acc, item) => acc.plus(item.subtotal),
    new Decimal(0),
  );
  const costoManoObra = new Decimal(parsed.horasManoObraEstimadas).times(
    parsed.tarifaManoObraHora,
  );
  const costoTransporte = new Decimal(parsed.costoTransporte);
  const margenPct = new Decimal(parsed.margenPct);

  const baseCosto = costoMaterialesTotal.plus(costoManoObra).plus(costoTransporte);
  const margenMonto = baseCosto.times(margenPct).dividedBy(100);
  const descuentoMonto = new Decimal(parsed.descuentoMonto);
  if (descuentoMonto.isNegative()) {
    throw new DescuentoInvalidoError("El descuento no puede ser negativo");
  }
  const subtotalConMargen = baseCosto.plus(margenMonto);
  if (descuentoMonto.greaterThan(subtotalConMargen)) {
    throw new DescuentoInvalidoError("El descuento no puede ser mayor al total de la cotización");
  }
  const precioFinal = subtotalConMargen.minus(descuentoMonto);

  return {
    items,
    costoMaterialesTotal: costoMaterialesTotal.toFixed(2),
    costoManoObra: costoManoObra.toFixed(2),
    costoTransporte: costoTransporte.toFixed(2),
    margenPctAplicado: margenPct.toFixed(2),
    baseCosto: baseCosto.toFixed(2),
    margenMonto: margenMonto.toFixed(2),
    descuentoMonto: descuentoMonto.toFixed(2),
    precioFinal: precioFinal.toFixed(2),
  };
}
