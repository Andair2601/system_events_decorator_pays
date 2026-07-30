import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/types.js";
import { createTestDb } from "../test/testDb.js";
import { MaterialNoEncontradoError } from "./errors.js";
import {
  actualizarMaterial,
  crearMaterial,
  desactivarMaterial,
  listarMateriales,
  obtenerMaterial,
  reactivarMaterial,
} from "./service.js";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe("materiales.service", () => {
  it("crea un material y lo puede leer de vuelta", async () => {
    const creado = await crearMaterial(db, {
      nombre: "Globo látex 12in",
      categoria: "globos",
      costoUnitario: 3.5,
      unidad: "pieza",
    });

    expect(creado.id).toBeTypeOf("number");
    expect(creado.costoUnitario).toBe("3.50");
    expect(creado.activo).toBe(true);

    const leido = await obtenerMaterial(db, creado.id);
    expect(leido?.nombre).toBe("Globo látex 12in");
  });

  it("rechaza crear un material con categoría inválida", async () => {
    await expect(
      crearMaterial(db, {
        nombre: "Cosa rara",
        // @ts-expect-error -- probando validación en runtime
        categoria: "no_existe",
        costoUnitario: 1,
        unidad: "pieza",
      }),
    ).rejects.toThrow();
  });

  it("lista solo materiales activos por defecto", async () => {
    const a = await crearMaterial(db, {
      nombre: "Arco de globos",
      categoria: "estructura",
      costoUnitario: 50,
      unidad: "pieza",
    });
    await crearMaterial(db, {
      nombre: "Tira de luces LED",
      categoria: "iluminacion",
      costoUnitario: 12,
      unidad: "metro",
    });
    await desactivarMaterial(db, a.id);

    const activos = await listarMateriales(db);
    expect(activos.map((m) => m.nombre)).toEqual(["Tira de luces LED"]);

    const todos = await listarMateriales(db, { incluirInactivos: true });
    expect(todos).toHaveLength(2);
  });

  it("filtra por categoría", async () => {
    await crearMaterial(db, {
      nombre: "Globo metálico",
      categoria: "globos",
      costoUnitario: 5,
      unidad: "pieza",
    });
    await crearMaterial(db, {
      nombre: "Letra gigante A",
      categoria: "letras",
      costoUnitario: 80,
      unidad: "pieza",
    });

    const globos = await listarMateriales(db, { categoria: "globos" });
    expect(globos).toHaveLength(1);
    expect(globos[0]?.categoria).toBe("globos");
  });

  it("actualiza campos parcialmente sin tocar el resto", async () => {
    const creado = await crearMaterial(db, {
      nombre: "Mantel redondo",
      categoria: "telas",
      costoUnitario: 15,
      unidad: "pieza",
    });

    const actualizado = await actualizarMaterial(db, creado.id, { costoUnitario: 18.75 });
    expect(actualizado.costoUnitario).toBe("18.75");
    expect(actualizado.nombre).toBe("Mantel redondo");
  });

  it("lanza MaterialNoEncontradoError al actualizar un id inexistente", async () => {
    await expect(actualizarMaterial(db, 9999, { costoUnitario: 1 })).rejects.toBeInstanceOf(
      MaterialNoEncontradoError,
    );
  });

  it("desactivar y reactivar cambian el flag activo sin borrar el registro", async () => {
    const creado = await crearMaterial(db, {
      nombre: "Cortina de flecos",
      categoria: "telas",
      costoUnitario: 22,
      unidad: "metro",
    });

    const desactivado = await desactivarMaterial(db, creado.id);
    expect(desactivado.activo).toBe(false);

    const reactivado = await reactivarMaterial(db, creado.id);
    expect(reactivado.activo).toBe(true);
  });
});
