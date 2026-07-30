import { z } from "zod";
import { MATERIAL_CATEGORIAS, MATERIAL_UNIDADES } from "../db/enums.js";

export const crearMaterialInputSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  categoria: z.enum(MATERIAL_CATEGORIAS),
  costoUnitario: z.number().nonnegative("El costo unitario no puede ser negativo"),
  unidad: z.enum(MATERIAL_UNIDADES),
});
export type CrearMaterialInput = z.infer<typeof crearMaterialInputSchema>;

export const actualizarMaterialInputSchema = crearMaterialInputSchema.partial();
export type ActualizarMaterialInput = z.infer<typeof actualizarMaterialInputSchema>;

export const listarMaterialesOptionsSchema = z.object({
  categoria: z.enum(MATERIAL_CATEGORIAS).optional(),
  incluirInactivos: z.boolean().optional().default(false),
});
export type ListarMaterialesOptions = z.input<typeof listarMaterialesOptionsSchema>;
