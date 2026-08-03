import { z } from "zod";
import { TIPOS_EVENTO } from "../db/enums.js";

export const crearFotoInputSchema = z.object({
  categoria: z.enum(TIPOS_EVENTO),
  reservaId: z.number().int().positive().optional(),
  s3Key: z.string().trim().min(1, "s3Key es obligatorio"),
  url: z.string().trim().min(1, "url es obligatoria"),
  destacada: z.boolean().optional().default(false),
});
export type CrearFotoInput = z.input<typeof crearFotoInputSchema>;

// s3Key/url son inmutables después de creada la foto: cambiarlas dejaría el
// registro apuntando a un archivo distinto al que realmente se subió.
export const actualizarFotoInputSchema = z.object({
  categoria: z.enum(TIPOS_EVENTO).optional(),
  reservaId: z.number().int().positive().nullable().optional(),
  destacada: z.boolean().optional(),
});
export type ActualizarFotoInput = z.infer<typeof actualizarFotoInputSchema>;

export const listarFotosOptionsSchema = z.object({
  categoria: z.enum(TIPOS_EVENTO).optional(),
  destacada: z.boolean().optional(),
  reservaId: z.number().int().positive().optional(),
});
export type ListarFotosOptions = z.input<typeof listarFotosOptionsSchema>;
