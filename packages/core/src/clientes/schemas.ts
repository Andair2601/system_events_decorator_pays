import { z } from "zod";

export const crearClienteInputSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  telefono: z.string().trim().min(1, "El teléfono es obligatorio"),
  email: z.string().email().optional(),
  notas: z.string().optional(),
});
export type CrearClienteInput = z.infer<typeof crearClienteInputSchema>;

export const actualizarClienteInputSchema = crearClienteInputSchema.partial();
export type ActualizarClienteInput = z.infer<typeof actualizarClienteInputSchema>;
