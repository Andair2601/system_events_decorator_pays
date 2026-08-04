import { z } from "zod";
import { RESERVA_ESTADOS } from "../db/enums.js";

export const crearReservaInputSchema = z.object({
  cotizacionId: z.number().int().positive(),
  // date/time quedan como string ("YYYY-MM-DD" / "HH:MM:SS"), igual que las
  // columnas date/time de Postgres en modo string de Drizzle.
  fechaEvento: z.string().min(1, "La fecha del evento es obligatoria"),
  horaEvento: z.string().optional(),
  lugar: z.string().trim().min(1, "El lugar es obligatorio"),
  notas: z.string().optional(),
});
export type CrearReservaInput = z.infer<typeof crearReservaInputSchema>;

export const actualizarEstadoReservaInputSchema = z.object({
  estado: z.enum(RESERVA_ESTADOS),
});

export const registrarPagoInputSchema = z.object({
  monto: z.number().positive("El monto del pago debe ser mayor a 0"),
});

export const agregarReservaItemInputSchema = z.object({
  descripcion: z.string().trim().min(1, "La descripción es obligatoria"),
  cantidad: z.number().positive().optional(),
});
export type AgregarReservaItemInput = z.infer<typeof agregarReservaItemInputSchema>;

export const actualizarReservaItemInputSchema = z.object({
  completado: z.boolean(),
});
export type ActualizarReservaItemInput = z.infer<typeof actualizarReservaItemInputSchema>;
