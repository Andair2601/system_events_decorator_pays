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

  it("responde 400 si el body no es JSON válido", async () => {
    const res = await app.request("/materiales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{esto no es json",
    });
    expect(res.status).toBe(400);
  });

  it("desactiva y reactiva un material", async () => {
    const { body: material } = await crearMaterialViaApi();

    const resDesactivar = await jsonRequest(`/materiales/${material.id}/desactivar`, "POST");
    expect((await readJson(resDesactivar)).activo).toBe(false);

    const resReactivar = await jsonRequest(`/materiales/${material.id}/reactivar`, "POST");
    expect((await readJson(resReactivar)).activo).toBe(true);
  });

  it("elimina un material sin uso, y responde 409 si está referenciado por una cotización", async () => {
    const { body: material } = await crearMaterialViaApi();
    const resEliminar = await jsonRequest(`/materiales/${material.id}`, "DELETE");
    expect(resEliminar.status).toBe(204);
    expect((await app.request(`/materiales/${material.id}`)).status).toBe(404);

    const { body: cliente } = await crearClienteViaApi();
    const { body: enUso } = await crearMaterialViaApi({ nombre: "Globo en uso" });
    await jsonRequest("/cotizaciones", "POST", {
      clienteId: cliente.id,
      nombreEvento: "Cumple de Mateo",
      tipoEvento: "cumpleanos_infantil",
      items: [{ materialId: enUso.id, cantidad: 5 }],
    });

    const resBloqueado = await jsonRequest(`/materiales/${enUso.id}`, "DELETE");
    expect(resBloqueado.status).toBe(409);
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

    const resPdf = await app.request(`/cotizaciones/${cotizacion.id}/pdf`);
    expect(resPdf.status).toBe(200);
    expect(resPdf.headers.get("content-type")).toBe("application/pdf");
    expect(resPdf.headers.get("content-disposition")).toContain(`cotizacion-${cotizacion.id}.pdf`);
    const bytes = new Uint8Array(await resPdf.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");

    const resPdfCliente = await app.request(`/cotizaciones/${cotizacion.id}/pdf?vista=cliente`);
    expect(resPdfCliente.status).toBe(200);
    expect(resPdfCliente.headers.get("content-disposition")).toContain(
      `cotizacion-${cotizacion.id}-cliente.pdf`,
    );
    const bytesCliente = new Uint8Array(await resPdfCliente.arrayBuffer());
    expect(Buffer.from(bytesCliente.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
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

  it("responde 404 al pedir el PDF de una cotización inexistente", async () => {
    const res = await app.request("/cotizaciones/9999/pdf");
    expect(res.status).toBe(404);
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

  it("permite editar una cotización en borrador (PUT) y aplica descuento", async () => {
    const { body: cliente } = await crearClienteViaApi();
    const { body: material } = await crearMaterialViaApi();
    const resCotizacion = await jsonRequest("/cotizaciones", "POST", {
      clienteId: cliente.id,
      nombreEvento: "Cotización editable",
      tipoEvento: "otro",
      items: [{ materialId: material.id, cantidad: 10 }],
      tarifaManoObraHora: 0,
      costoTransporte: 0,
      margenPct: 0,
    });
    const cotizacion = await readJson(resCotizacion);
    expect(cotizacion.precioFinal).toBe("10.00");

    const resEditar = await jsonRequest(`/cotizaciones/${cotizacion.id}`, "PUT", {
      nombreEvento: "Cotización editada",
      tipoEvento: "otro",
      items: [{ materialId: material.id, cantidad: 10 }],
      tarifaManoObraHora: 0,
      costoTransporte: 0,
      margenPct: 0,
      descuentoMonto: 3,
    });
    expect(resEditar.status).toBe(200);
    const editada = await readJson(resEditar);
    expect(editada.nombreEvento).toBe("Cotización editada");
    expect(editada.precioFinal).toBe("7.00");
  });

  it("responde 409 al editar una cotización que ya no está en borrador", async () => {
    const { body: cliente } = await crearClienteViaApi();
    const { body: material } = await crearMaterialViaApi();
    const resCotizacion = await jsonRequest("/cotizaciones", "POST", {
      clienteId: cliente.id,
      nombreEvento: "Cotización aceptada",
      tipoEvento: "otro",
      items: [{ materialId: material.id, cantidad: 1 }],
    });
    const cotizacion = await readJson(resCotizacion);
    await jsonRequest(`/cotizaciones/${cotizacion.id}/estado`, "PATCH", { estado: "aceptada" });

    const resEditar = await jsonRequest(`/cotizaciones/${cotizacion.id}`, "PUT", {
      nombreEvento: "Intento de edición",
      tipoEvento: "otro",
      items: [{ materialId: material.id, cantidad: 2 }],
    });
    expect(resEditar.status).toBe(409);
  });
});

describe("API health", () => {
  it("responde ok", async () => {
    const res = await app.request("/health");
    expect(await readJson(res)).toEqual({ status: "ok" });
  });
});
