import { z } from "zod";
import { COTIZACION_ESTADOS, COTIZACION_ORIGENES, TIPOS_EVENTO } from "../db/enums.js";

export const cotizacionItemEntradaSchema = z.object({
  materialId: z.number().int().positive(),
  cantidad: z.number().positive(),
});
export type CotizacionItemEntrada = z.infer<typeof cotizacionItemEntradaSchema>;

export const crearCotizacionInputSchema = z.object({
  clienteId: z.number().int().positive(),
  nombreEvento: z.string().trim().min(1, "El nombre del evento es obligatorio"),
  tipoEvento: z.enum(TIPOS_EVENTO),
  items: z.array(cotizacionItemEntradaSchema).min(1, "La cotización necesita al menos un material"),
  // Todos opcionales: si se omiten, el servicio usa configuracion_costeo.
  horasManoObraEstimadas: z.number().nonnegative().optional(),
  tarifaManoObraHora: z.number().nonnegative().optional(),
  costoTransporte: z.number().nonnegative().optional(),
  margenPct: z.number().nonnegative().optional(),
  imagenReferenciaUrl: z.string().url().optional(),
  origen: z.enum(COTIZACION_ORIGENES).default("manual"),
});
// z.input porque `origen` tiene default(): debe quedar opcional en el tipo de entrada.
export type CrearCotizacionInput = z.input<typeof crearCotizacionInputSchema>;

export const actualizarEstadoCotizacionInputSchema = z.object({
  estado: z.enum(COTIZACION_ESTADOS),
});
