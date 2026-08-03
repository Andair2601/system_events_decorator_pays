import { beforeEach, describe, expect, it } from "vitest";
import { CotizacionNoAceptadaError, CotizacionNoEncontradaError } from "../cotizaciones/errors.js";
import { actualizarEstadoCotizacion, crearCotizacion } from "../cotizaciones/service.js";
import { crearCliente } from "../clientes/service.js";
import type { Database } from "../db/types.js";
import { crearMaterial } from "../materiales/service.js";
import { createTestDb } from "../test/testDb.js";
import { ReservaNoEncontradaError } from "./errors.js";
import {
  actualizarEstadoReserva,
  crearReserva,
  listarReservas,
  obtenerReserva,
  registrarPago,
} from "./service.js";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function seedCotizacionAceptada(db: Database) {
  const cliente = await crearCliente(db, { nombre: "Ana Pérez", telefono: "+51999111222" });
  const globo = await crearMaterial(db, {
    nombre: "Globo látex 12in",
    categoria: "globos",
    costoUnitario: 1,
    unidad: "pieza",
  });
  const cotizacion = await crearCotizacion(db, {
    clienteId: cliente.id,
    nombreEvento: "Cumple de Mateo",
    tipoEvento: "cumpleanos_infantil",
    items: [{ materialId: globo.id, cantidad: 100 }],
    tarifaManoObraHora: 0,
    costoTransporte: 0,
    margenPct: 0,
  }); // precioFinal = 100.00
  await actualizarEstadoCotizacion(db, cotizacion.id, "aceptada");
  return { cliente, cotizacion };
}

describe("reservas.service", () => {
  it("crea una reserva a partir de una cotización aceptada, heredando el cliente", async () => {
    const { cliente, cotizacion } = await seedCotizacionAceptada(db);

    const reserva = await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      horaEvento: "16:00:00",
      lugar: "Salón Los Pinos",
    });

    expect(reserva.clienteId).toBe(cliente.id);
    expect(reserva.estado).toBe("confirmada");
    expect(reserva.estadoPago).toBe("pendiente");
    expect(reserva.montoPagado).toBe("0.00");
  });

  it("rechaza crear una reserva desde una cotización en estado borrador", async () => {
    const cliente = await crearCliente(db, { nombre: "Ana Pérez", telefono: "+51999111222" });
    const globo = await crearMaterial(db, {
      nombre: "Globo látex 12in",
      categoria: "globos",
      costoUnitario: 1,
      unidad: "pieza",
    });
    const cotizacion = await crearCotizacion(db, {
      clienteId: cliente.id,
      nombreEvento: "Evento sin aceptar",
      tipoEvento: "otro",
      items: [{ materialId: globo.id, cantidad: 1 }],
    });

    await expect(
      crearReserva(db, {
        cotizacionId: cotizacion.id,
        fechaEvento: "2026-09-15",
        lugar: "Salón Los Pinos",
      }),
    ).rejects.toBeInstanceOf(CotizacionNoAceptadaError);
  });

  it("rechaza crear una reserva desde una cotización inexistente", async () => {
    await expect(
      crearReserva(db, { cotizacionId: 9999, fechaEvento: "2026-09-15", lugar: "X" }),
    ).rejects.toBeInstanceOf(CotizacionNoEncontradaError);
  });

  it("registrarPago acumula el monto y pasa a parcial, luego a pagado", async () => {
    const { cotizacion } = await seedCotizacionAceptada(db);
    const reserva = await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      lugar: "Salón Los Pinos",
    });

    const conAbono = await registrarPago(db, reserva.id, 40);
    expect(conAbono.montoPagado).toBe("40.00");
    expect(conAbono.estadoPago).toBe("parcial");

    const pagadaCompleta = await registrarPago(db, reserva.id, 60);
    expect(pagadaCompleta.montoPagado).toBe("100.00");
    expect(pagadaCompleta.estadoPago).toBe("pagado");
  });

  it("lanza ReservaNoEncontradaError al registrar pago de un id inexistente", async () => {
    await expect(registrarPago(db, 9999, 10)).rejects.toBeInstanceOf(ReservaNoEncontradaError);
  });

  it("actualiza el estado de la reserva", async () => {
    const { cotizacion } = await seedCotizacionAceptada(db);
    const reserva = await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      lugar: "Salón Los Pinos",
    });

    const actualizada = await actualizarEstadoReserva(db, reserva.id, "completada");
    expect(actualizada.estado).toBe("completada");
  });

  it("lista reservas filtrando por rango de fechas", async () => {
    const { cotizacion } = await seedCotizacionAceptada(db);
    await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-01-10",
      lugar: "A",
    });
    await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-06-10",
      lugar: "B",
    });

    const enero = await listarReservas(db, { desde: "2026-01-01", hasta: "2026-02-01" });
    expect(enero.map((r) => r.lugar)).toEqual(["A"]);
  });

  it("obtenerReserva devuelve null si no existe", async () => {
    expect(await obtenerReserva(db, 9999)).toBeNull();
  });

  it("expone montoTotal y montoPendiente derivados del precio_final de la cotización", async () => {
    const { cotizacion } = await seedCotizacionAceptada(db); // precioFinal = 100.00
    const reserva = await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      lugar: "Salón Los Pinos",
    });
    await registrarPago(db, reserva.id, 40);

    const [enLista] = await listarReservas(db);
    expect(enLista?.montoTotal).toBe("100.00");
    expect(enLista?.montoPendiente).toBe("60.00");

    const obtenida = await obtenerReserva(db, reserva.id);
    expect(obtenida?.montoTotal).toBe("100.00");
    expect(obtenida?.montoPendiente).toBe("60.00");
  });
});
