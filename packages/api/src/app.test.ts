import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@deco-eventos/core/src/test/testDb.js";
import type { Database } from "@deco-eventos/core";
import { createApp, type App } from "./app.js";

let db: Database;
let app: App;

beforeEach(async () => {
  db = await createTestDb();
  app = createApp(db);
});

function jsonRequest(path: string, method: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// El tipado de Response#json() de Hono/lib.dom es `unknown`; en tests de
// integración conviene un cast puntual en vez de definir un tipo de
// respuesta por endpoint solo para las aserciones.
async function readJson<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function crearMaterialViaApi(overrides: Record<string, unknown> = {}) {
  const res = await jsonRequest("/materiales", "POST", {
    nombre: "Globo látex 12in",
    categoria: "globos",
    costoUnitario: 1,
    unidad: "pieza",
    ...overrides,
  });
  return { res, body: await readJson(res) };
}

async function crearClienteViaApi(overrides: Record<string, unknown> = {}) {
  const res = await jsonRequest("/clientes", "POST", {
    nombre: "Ana Pérez",
    telefono: "+51999111222",
    ...overrides,
  });
  return { res, body: await readJson(res) };
}

describe("API materiales", () => {
  it("crea y lista materiales", async () => {
    const { res: resCrear, body: material } = await crearMaterialViaApi();
    expect(resCrear.status).toBe(201);
    expect(material.nombre).toBe("Globo látex 12in");

    const resListar = await app.request("/materiales");
    expect(resListar.status).toBe(200);
    expect(await readJson(resListar)).toHaveLength(1);
  });

  it("responde 400 con detalles de validación si faltan campos obligatorios", async () => {
    const { res, body } = await crearMaterialViaApi({ nombre: "" });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Datos inválidos");
    expect(body.detalles).toBeDefined();
  });

  it("responde 404 al pedir un material inexistente", async () => {
    const res = await app.request("/materiales/9999");
    expect(res.status).toBe(404);
  });

  it("responde 400 si el id no es numérico", async () => {
    const res = await app.request("/materiales/abc");
    expect(res.status).toBe(400);
  });

  it("desactiva y reactiva un material", async () => {
    const { body: material } = await crearMaterialViaApi();

    const resDesactivar = await jsonRequest(`/materiales/${material.id}/desactivar`, "POST");
    expect((await readJson(resDesactivar)).activo).toBe(false);

    const resReactivar = await jsonRequest(`/materiales/${material.id}/reactivar`, "POST");
    expect((await readJson(resReactivar)).activo).toBe(true);
  });
});

describe("API configuración de costeo", () => {
  it("devuelve null si no se ha guardado configuración, luego persiste un upsert", async () => {
    const resVacia = await app.request("/configuracion");
    expect(await readJson(resVacia)).toBeNull();

    const resGuardar = await jsonRequest("/configuracion", "PUT", {
      tarifaManoObraHora: 20,
      margenDefaultPct: 30,
      tarifaTransporteDefault: 15,
    });
    expect(resGuardar.status).toBe(200);
    expect((await readJson(resGuardar)).margenDefaultPct).toBe("30.00");
  });
});

describe("API flujo completo: cotización -> reserva", () => {
  it("cotiza, acepta, reserva y registra pago hasta quedar saldada", async () => {
    const { body: cliente } = await crearClienteViaApi();
    const { body: material } = await crearMaterialViaApi();

    const resCotizacion = await jsonRequest("/cotizaciones", "POST", {
      clienteId: cliente.id,
      nombreEvento: "Cumple de Mateo",
      tipoEvento: "cumpleanos_infantil",
      items: [{ materialId: material.id, cantidad: 100 }],
      tarifaManoObraHora: 0,
      costoTransporte: 0,
      margenPct: 0,
    });
    expect(resCotizacion.status).toBe(201);
    const cotizacion = await readJson(resCotizacion);
    expect(cotizacion.precioFinal).toBe("100.00");

    const resAceptar = await jsonRequest(`/cotizaciones/${cotizacion.id}/estado`, "PATCH", {
      estado: "aceptada",
    });
    expect(resAceptar.status).toBe(200);

    const resReserva = await jsonRequest("/reservas", "POST", {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      lugar: "Salón Los Pinos",
    });
    expect(resReserva.status).toBe(201);
    const reserva = await readJson(resReserva);
    expect(reserva.estadoPago).toBe("pendiente");

    const resPago = await jsonRequest(`/reservas/${reserva.id}/pagos`, "POST", { monto: 100 });
    expect(resPago.status).toBe(200);
    expect((await readJson(resPago)).estadoPago).toBe("pagado");
  });

  it("responde 409 si se intenta reservar desde una cotización no aceptada", async () => {
    const { body: cliente } = await crearClienteViaApi();
    const { body: material } = await crearMaterialViaApi();
    const resCotizacion = await jsonRequest("/cotizaciones", "POST", {
      clienteId: cliente.id,
      nombreEvento: "Evento sin aceptar",
      tipoEvento: "otro",
      items: [{ materialId: material.id, cantidad: 1 }],
    });
    const cotizacion = await readJson(resCotizacion);

    const resReserva = await jsonRequest("/reservas", "POST", {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      lugar: "X",
    });
    expect(resReserva.status).toBe(409);
  });

  it("responde 400 si la cotización referencia un material inexistente", async () => {
    const { body: cliente } = await crearClienteViaApi();
    const resCotizacion = await jsonRequest("/cotizaciones", "POST", {
      clienteId: cliente.id,
      nombreEvento: "Evento con material inválido",
      tipoEvento: "otro",
      items: [{ materialId: 9999, cantidad: 1 }],
    });
    expect(resCotizacion.status).toBe(400);
  });
});

describe("API health", () => {
  it("responde ok", async () => {
    const res = await app.request("/health");
    expect(await readJson(res)).toEqual({ status: "ok" });
  });
});
