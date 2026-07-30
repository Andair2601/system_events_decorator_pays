import { beforeEach, describe, expect, it } from "vitest";
import { crearCliente } from "../clientes/service.js";
import { guardarConfiguracionCosteo } from "../configuracion/service.js";
import type { Database } from "../db/types.js";
import { crearMaterial } from "../materiales/service.js";
import { createTestDb } from "../test/testDb.js";
import { CotizacionNoEncontradaError, MaterialInexistenteError } from "./errors.js";
import {
  actualizarEstadoCotizacion,
  crearCotizacion,
  listarCotizaciones,
  obtenerCotizacion,
} from "./service.js";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function seedBase(db: Database) {
  const cliente = await crearCliente(db, { nombre: "Ana Pérez", telefono: "+51999111222" });
  const globo = await crearMaterial(db, {
    nombre: "Globo látex 12in",
    categoria: "globos",
    costoUnitario: 0.8,
    unidad: "pieza",
  });
  const arco = await crearMaterial(db, {
    nombre: "Arco de globos",
    categoria: "estructura",
    costoUnitario: 45,
    unidad: "pieza",
  });
  await guardarConfiguracionCosteo(db, {
    tarifaManoObraHora: 20,
    margenDefaultPct: 30,
    tarifaTransporteDefault: 15,
  });
  return { cliente, globo, arco };
}

describe("cotizaciones.service", () => {
  it("crea una cotización usando los costos del catálogo y los defaults de configuración", async () => {
    const { cliente, globo, arco } = await seedBase(db);

    const cotizacion = await crearCotizacion(db, {
      clienteId: cliente.id,
      nombreEvento: "Cumple de Mateo",
      tipoEvento: "cumpleanos_infantil",
      items: [
        { materialId: globo.id, cantidad: 50 },
        { materialId: arco.id, cantidad: 1 },
      ],
      horasManoObraEstimadas: 3,
    });

    // materiales: 50*0.8 + 1*45 = 40 + 45 = 85
    // mano de obra: 3 * 20 (default) = 60
    // transporte: 15 (default)
    // base = 85 + 60 + 15 = 160; margen 30% (default) = 48; final = 208
    expect(cotizacion.costoMaterialesTotal).toBe("85.00");
    expect(cotizacion.costoManoObra).toBe("60.00");
    expect(cotizacion.costoTransporte).toBe("15.00");
    expect(cotizacion.margenPctAplicado).toBe("30.00");
    expect(cotizacion.precioFinal).toBe("208.00");
    expect(cotizacion.estado).toBe("borrador");
    expect(cotizacion.origen).toBe("manual");
    expect(cotizacion.items).toHaveLength(2);
  });

  it("congela el costo unitario del material en el momento de cotizar (snapshot)", async () => {
    const { cliente, globo } = await seedBase(db);

    const cotizacion = await crearCotizacion(db, {
      clienteId: cliente.id,
      nombreEvento: "Baby shower de Lu",
      tipoEvento: "baby_shower",
      items: [{ materialId: globo.id, cantidad: 10 }],
    });
    const subtotalOriginal = cotizacion.items[0]?.subtotal;
    expect(subtotalOriginal).toBe("8.00"); // 10 * 0.80

    // Sube el precio del material después de cotizar...
    const { actualizarMaterial } = await import("../materiales/service.js");
    await actualizarMaterial(db, globo.id, { costoUnitario: 5 });

    // ...la cotización ya guardada no debe cambiar.
    const releida = await obtenerCotizacion(db, cotizacion.id);
    expect(releida?.items[0]?.subtotal).toBe("8.00");
  });

  it("permite pasar tarifas explícitas que ganan sobre la configuración default", async () => {
    const { cliente, globo } = await seedBase(db);

    const cotizacion = await crearCotizacion(db, {
      clienteId: cliente.id,
      nombreEvento: "Gender reveal",
      tipoEvento: "gender_reveal",
      items: [{ materialId: globo.id, cantidad: 10 }],
      tarifaManoObraHora: 0,
      costoTransporte: 0,
      margenPct: 0,
    });

    expect(cotizacion.costoManoObra).toBe("0.00");
    expect(cotizacion.costoTransporte).toBe("0.00");
    expect(cotizacion.precioFinal).toBe("8.00");
  });

  it("rechaza un material inexistente o inactivo", async () => {
    const { cliente, globo } = await seedBase(db);
    const { desactivarMaterial } = await import("../materiales/service.js");
    await desactivarMaterial(db, globo.id);

    await expect(
      crearCotizacion(db, {
        clienteId: cliente.id,
        nombreEvento: "Evento X",
        tipoEvento: "otro",
        items: [{ materialId: globo.id, cantidad: 1 }],
      }),
    ).rejects.toBeInstanceOf(MaterialInexistenteError);
  });

  it("lista y filtra cotizaciones por cliente y estado", async () => {
    const { cliente, globo } = await seedBase(db);
    const c1 = await crearCotizacion(db, {
      clienteId: cliente.id,
      nombreEvento: "Evento 1",
      tipoEvento: "otro",
      items: [{ materialId: globo.id, cantidad: 1 }],
    });
    await crearCotizacion(db, {
      clienteId: cliente.id,
      nombreEvento: "Evento 2",
      tipoEvento: "otro",
      items: [{ materialId: globo.id, cantidad: 1 }],
    });

    await actualizarEstadoCotizacion(db, c1.id, "aceptada");

    const aceptadas = await listarCotizaciones(db, { clienteId: cliente.id, estado: "aceptada" });
    expect(aceptadas.map((c) => c.nombreEvento)).toEqual(["Evento 1"]);
  });

  it("lanza CotizacionNoEncontradaError al cambiar estado de un id inexistente", async () => {
    await expect(actualizarEstadoCotizacion(db, 9999, "aceptada")).rejects.toBeInstanceOf(
      CotizacionNoEncontradaError,
    );
  });
});
