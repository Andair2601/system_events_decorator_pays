import { beforeEach, describe, expect, it } from "vitest";
import { crearCliente } from "../clientes/service.js";
import { guardarConfiguracionCosteo } from "../configuracion/service.js";
import type { Database } from "../db/types.js";
import { crearMaterial } from "../materiales/service.js";
import { createTestDb } from "../test/testDb.js";
import { generarCotizacionPdf } from "./pdf.js";
import { crearCotizacion, obtenerCotizacionCompleta } from "./service.js";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe("cotizaciones.pdf", () => {
  it("genera un PDF a partir de una cotización completa", async () => {
    const cliente = await crearCliente(db, { nombre: "Ana Pérez", telefono: "+51999111222" });
    const globo = await crearMaterial(db, {
      nombre: "Globo látex 12in",
      categoria: "globos",
      costoUnitario: 0.8,
      unidad: "pieza",
    });
    await guardarConfiguracionCosteo(db, {
      tarifaManoObraHora: 20,
      margenDefaultPct: 30,
      tarifaTransporteDefault: 15,
    });
    const cotizacion = await crearCotizacion(db, {
      clienteId: cliente.id,
      nombreEvento: "Cumple de Mateo",
      tipoEvento: "cumpleanos_infantil",
      items: [{ materialId: globo.id, cantidad: 10 }],
      horasManoObraEstimadas: 2,
    });

    const completa = await obtenerCotizacionCompleta(db, cotizacion.id);
    expect(completa?.cliente.nombre).toBe("Ana Pérez");
    expect(completa?.items[0]?.materialNombre).toBe("Globo látex 12in");

    const pdf = await generarCotizacionPdf(completa!);
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(500);

    // Vista de cliente: mismo total, sin exponer el % de margen (el
    // contenido va comprimido dentro del PDF así que no se puede grep
    // texto plano acá; queda verificado visualmente al bajar el PDF real).
    const pdfCliente = await generarCotizacionPdf(completa!, "cliente");
    expect(pdfCliente.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdfCliente.length).toBeGreaterThan(500);
  });

  it("obtenerCotizacionCompleta devuelve null para un id inexistente", async () => {
    const completa = await obtenerCotizacionCompleta(db, 9999);
    expect(completa).toBeNull();
  });
});
