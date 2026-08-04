import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { crearFoto } from "../album/service.js";
import { CotizacionNoAceptadaError, CotizacionNoEncontradaError } from "../cotizaciones/errors.js";
import { actualizarEstadoCotizacion, crearCotizacion } from "../cotizaciones/service.js";
import { crearCliente } from "../clientes/service.js";
import { albumFotos, reservas } from "../db/schema.js";
import type { Database } from "../db/types.js";
import { crearMaterial } from "../materiales/service.js";
import { createTestDb } from "../test/testDb.js";
import { ReservaItemFijoError, ReservaItemNoEncontradoError, ReservaNoEncontradaError } from "./errors.js";
import {
  actualizarEstadoReserva,
  actualizarReservaItem,
  agregarReservaItemAdicional,
  crearReserva,
  eliminarReserva,
  eliminarReservaItem,
  listarReservas,
  obtenerReserva,
  obtenerReservaDetalle,
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

  it("crea una reserva y siembra la checklist de materiales desde la cotización", async () => {
    const { cotizacion } = await seedCotizacionAceptada(db); // 1 item: globo x100
    const reserva = await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      lugar: "Salón Los Pinos",
    });

    const detalle = await obtenerReservaDetalle(db, reserva.id);
    expect(detalle?.items).toHaveLength(1);
    expect(detalle?.items[0]?.origen).toBe("cotizacion");
    expect(detalle?.items[0]?.completado).toBe(false);
    expect(detalle?.items[0]?.descripcion).toBe("Globo látex 12in");
    expect(detalle?.cotizacion?.id).toBe(cotizacion.id);
  });

  it("obtenerReservaDetalle siembra la checklist de forma perezosa para una reserva creada antes de esta feature", async () => {
    const { cliente, cotizacion } = await seedCotizacionAceptada(db);
    // Simula una reserva pre-existente insertada directo (sin pasar por
    // crearReserva, que ya siembra la checklist al crear).
    const [reservaPrevia] = await db
      .insert(reservas)
      .values({
        cotizacionId: cotizacion.id,
        clienteId: cliente.id,
        fechaEvento: "2026-09-15",
        lugar: "Salón Los Pinos",
      })
      .returning();

    const detalle = await obtenerReservaDetalle(db, reservaPrevia!.id);
    expect(detalle?.items).toHaveLength(1);
    expect(detalle?.items[0]?.origen).toBe("cotizacion");
  });

  it("obtenerReservaDetalle devuelve cotizacion null y sin items fijos si la reserva no tiene cotizacionId", async () => {
    const cliente = await crearCliente(db, { nombre: "Sin cotización", telefono: "+51999333444" });
    const [reservaSuelta] = await db
      .insert(reservas)
      .values({ clienteId: cliente.id, fechaEvento: "2026-09-15", lugar: "Salón Los Pinos" })
      .returning();

    const detalle = await obtenerReservaDetalle(db, reservaSuelta!.id);
    expect(detalle?.cotizacion).toBeNull();
    expect(detalle?.items).toHaveLength(0);
  });

  it("agrega, marca y elimina un ítem adicional de la checklist", async () => {
    const { cotizacion } = await seedCotizacionAceptada(db);
    const reserva = await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      lugar: "Salón Los Pinos",
    });

    const item = await agregarReservaItemAdicional(db, reserva.id, {
      descripcion: "Confirmar transporte",
      cantidad: 1,
    });
    expect(item.origen).toBe("adicional");
    expect(item.completado).toBe(false);

    const marcado = await actualizarReservaItem(db, item.id, { completado: true });
    expect(marcado.completado).toBe(true);

    await eliminarReservaItem(db, item.id);
    const detalle = await obtenerReservaDetalle(db, reserva.id);
    expect(detalle?.items.find((i) => i.id === item.id)).toBeUndefined();
  });

  it("lanza ReservaItemNoEncontradoError al actualizar un ítem inexistente", async () => {
    await expect(actualizarReservaItem(db, 9999, { completado: true })).rejects.toBeInstanceOf(
      ReservaItemNoEncontradoError,
    );
  });

  it("lanza ReservaItemFijoError al intentar eliminar un ítem que viene de la cotización", async () => {
    const { cotizacion } = await seedCotizacionAceptada(db);
    const reserva = await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      lugar: "Salón Los Pinos",
    });
    const detalle = await obtenerReservaDetalle(db, reserva.id);
    const itemFijo = detalle!.items[0]!;

    await expect(eliminarReservaItem(db, itemFijo.id)).rejects.toBeInstanceOf(ReservaItemFijoError);
  });

  it("elimina una reserva, cascadea su checklist y desasocia las fotos del álbum", async () => {
    const { cotizacion } = await seedCotizacionAceptada(db);
    const reserva = await crearReserva(db, {
      cotizacionId: cotizacion.id,
      fechaEvento: "2026-09-15",
      lugar: "Salón Los Pinos",
    });
    const foto = await crearFoto(db, {
      categoria: "otro",
      reservaId: reserva.id,
      s3Key: "fotos/x.jpg",
      url: "https://cdn.example.com/fotos/x.jpg",
    });

    await eliminarReserva(db, reserva.id);

    expect(await obtenerReserva(db, reserva.id)).toBeNull();
    const [fotoActualizada] = await db.select().from(albumFotos).where(eq(albumFotos.id, foto.id));
    expect(fotoActualizada?.reservaId).toBeNull();
  });

  it("lanza ReservaNoEncontradaError al eliminar un id inexistente", async () => {
    await expect(eliminarReserva(db, 9999)).rejects.toBeInstanceOf(ReservaNoEncontradaError);
  });
});
