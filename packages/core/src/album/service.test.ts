import { beforeEach, describe, expect, it } from "vitest";
import { crearCliente } from "../clientes/service.js";
import { actualizarEstadoCotizacion, crearCotizacion } from "../cotizaciones/service.js";
import type { Database } from "../db/types.js";
import { crearMaterial } from "../materiales/service.js";
import { crearReserva } from "../reservas/service.js";
import { ReservaNoEncontradaError } from "../reservas/errors.js";
import { createTestDb } from "../test/testDb.js";
import { AlbumFotoNoEncontradaError } from "./errors.js";
import { actualizarFoto, crearFoto, eliminarFoto, listarFotos, obtenerFoto } from "./service.js";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function seedReserva(db: Database) {
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
    items: [{ materialId: globo.id, cantidad: 10 }],
    tarifaManoObraHora: 0,
    costoTransporte: 0,
    margenPct: 0,
  });
  await actualizarEstadoCotizacion(db, cotizacion.id, "aceptada");
  return crearReserva(db, {
    cotizacionId: cotizacion.id,
    fechaEvento: "2026-09-15",
    lugar: "Salón Los Pinos",
  });
}

describe("album.service", () => {
  it("crea una foto y la puede leer de vuelta", async () => {
    const creada = await crearFoto(db, {
      categoria: "cumpleanos_infantil",
      s3Key: "fotos/abc.jpg",
      url: "https://cdn.example.com/fotos/abc.jpg",
    });

    expect(creada.id).toBeTypeOf("number");
    expect(creada.destacada).toBe(false);
    expect(creada.reservaId).toBeNull();

    const leida = await obtenerFoto(db, creada.id);
    expect(leida?.s3Key).toBe("fotos/abc.jpg");
  });

  it("rechaza crear una foto con categoría inválida", async () => {
    await expect(
      crearFoto(db, {
        // @ts-expect-error -- probando validación en runtime
        categoria: "no_existe",
        s3Key: "fotos/abc.jpg",
        url: "https://cdn.example.com/fotos/abc.jpg",
      }),
    ).rejects.toThrow();
  });

  it("crea una foto asociada a una reserva existente", async () => {
    const reserva = await seedReserva(db);

    const creada = await crearFoto(db, {
      categoria: "cumpleanos_infantil",
      reservaId: reserva.id,
      s3Key: "fotos/def.jpg",
      url: "https://cdn.example.com/fotos/def.jpg",
      destacada: true,
    });

    expect(creada.reservaId).toBe(reserva.id);
    expect(creada.destacada).toBe(true);
  });

  it("lanza ReservaNoEncontradaError al crear una foto con reservaId inexistente", async () => {
    await expect(
      crearFoto(db, {
        categoria: "otro",
        reservaId: 9999,
        s3Key: "fotos/ghi.jpg",
        url: "https://cdn.example.com/fotos/ghi.jpg",
      }),
    ).rejects.toBeInstanceOf(ReservaNoEncontradaError);
  });

  it("lista y filtra fotos por categoria, destacada y reservaId", async () => {
    const reserva = await seedReserva(db);
    await crearFoto(db, {
      categoria: "cumpleanos_infantil",
      reservaId: reserva.id,
      s3Key: "fotos/1.jpg",
      url: "https://cdn.example.com/fotos/1.jpg",
      destacada: true,
    });
    await crearFoto(db, {
      categoria: "matrimonio",
      s3Key: "fotos/2.jpg",
      url: "https://cdn.example.com/fotos/2.jpg",
    });

    expect(await listarFotos(db, { categoria: "matrimonio" })).toHaveLength(1);
    expect(await listarFotos(db, { destacada: true })).toHaveLength(1);
    expect(await listarFotos(db, { reservaId: reserva.id })).toHaveLength(1);
    expect(await listarFotos(db)).toHaveLength(2);
  });

  it("actualiza campos parcialmente sin tocar el resto", async () => {
    const creada = await crearFoto(db, {
      categoria: "bautizo",
      s3Key: "fotos/x.jpg",
      url: "https://cdn.example.com/fotos/x.jpg",
    });

    const actualizada = await actualizarFoto(db, creada.id, { destacada: true });
    expect(actualizada.destacada).toBe(true);
    expect(actualizada.categoria).toBe("bautizo");
  });

  it("lanza AlbumFotoNoEncontradaError al actualizar un id inexistente", async () => {
    await expect(actualizarFoto(db, 9999, { destacada: true })).rejects.toBeInstanceOf(
      AlbumFotoNoEncontradaError,
    );
  });

  it("elimina una foto", async () => {
    const creada = await crearFoto(db, {
      categoria: "aniversario",
      s3Key: "fotos/y.jpg",
      url: "https://cdn.example.com/fotos/y.jpg",
    });

    await eliminarFoto(db, creada.id);
    expect(await obtenerFoto(db, creada.id)).toBeNull();
  });

  it("lanza AlbumFotoNoEncontradaError al eliminar un id inexistente", async () => {
    await expect(eliminarFoto(db, 9999)).rejects.toBeInstanceOf(AlbumFotoNoEncontradaError);
  });
});
