import { z } from "zod";

export const configuracionCosteoInputSchema = z.object({
  tarifaManoObraHora: z.number().nonnegative(),
  margenDefaultPct: z.number().nonnegative(),
  tarifaTransporteDefault: z.number().nonnegative(),
});
export type ConfiguracionCosteoInput = z.infer<typeof configuracionCosteoInputSchema>;
