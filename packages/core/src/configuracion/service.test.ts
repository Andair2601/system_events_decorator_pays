import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/types.js";
import { createTestDb } from "../test/testDb.js";
import { guardarConfiguracionCosteo, obtenerConfiguracionCosteo } from "./service.js";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe("configuracion.service", () => {
  it("no hay configuración antes de guardar nada", async () => {
    expect(await obtenerConfiguracionCosteo(db)).toBeNull();
  });

  it("crea la fila única la primera vez que se guarda", async () => {
    const guardada = await guardarConfiguracionCosteo(db, {
      tarifaManoObraHora: 20,
      margenDefaultPct: 30,
      tarifaTransporteDefault: 15,
    });
    expect(guardada.tarifaManoObraHora).toBe("20.00");

    const leida = await obtenerConfiguracionCosteo(db);
    expect(leida?.id).toBe(guardada.id);
  });

  it("actualiza la misma fila en vez de crear una nueva al guardar de nuevo", async () => {
    const primera = await guardarConfiguracionCosteo(db, {
      tarifaManoObraHora: 20,
      margenDefaultPct: 30,
      tarifaTransporteDefault: 15,
    });
    const segunda = await guardarConfiguracionCosteo(db, {
      tarifaManoObraHora: 25,
      margenDefaultPct: 35,
      tarifaTransporteDefault: 18,
    });

    expect(segunda.id).toBe(primera.id);
    expect(segunda.tarifaManoObraHora).toBe("25.00");
    expect(segunda.margenDefaultPct).toBe("35.00");
  });
});
