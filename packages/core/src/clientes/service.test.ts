import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/types.js";
import { createTestDb } from "../test/testDb.js";
import { ClienteNoEncontradoError } from "./errors.js";
import {
  actualizarCliente,
  crearCliente,
  listarClientes,
  obtenerCliente,
  obtenerClientePorTelefono,
  obtenerOCrearClientePorTelefono,
} from "./service.js";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe("clientes.service", () => {
  it("crea un cliente y lo puede leer de vuelta", async () => {
    const creado = await crearCliente(db, { nombre: "Ana Pérez", telefono: "+51999111222" });
    const leido = await obtenerCliente(db, creado.id);
    expect(leido?.telefono).toBe("+51999111222");
  });

  it("rechaza dos clientes con el mismo teléfono", async () => {
    await crearCliente(db, { nombre: "Ana Pérez", telefono: "+51999111222" });
    await expect(
      crearCliente(db, { nombre: "Otra Persona", telefono: "+51999111222" }),
    ).rejects.toThrow();
  });

  it("obtenerOCrearClientePorTelefono reutiliza el cliente existente", async () => {
    const primero = await crearCliente(db, { nombre: "Ana Pérez", telefono: "+51999111222" });
    const resultado = await obtenerOCrearClientePorTelefono(db, {
      telefono: "+51999111222",
      nombre: "Ana P.",
    });
    expect(resultado.id).toBe(primero.id);
    expect(resultado.nombre).toBe("Ana Pérez");
  });

  it("obtenerOCrearClientePorTelefono crea uno nuevo si no existe", async () => {
    const resultado = await obtenerOCrearClientePorTelefono(db, {
      telefono: "+51999333444",
      nombre: "Cliente Nuevo",
    });
    expect(resultado.id).toBeTypeOf("number");
    const buscado = await obtenerClientePorTelefono(db, "+51999333444");
    expect(buscado?.nombre).toBe("Cliente Nuevo");
  });

  it("lista clientes ordenados por nombre", async () => {
    await crearCliente(db, { nombre: "Zoe", telefono: "1" });
    await crearCliente(db, { nombre: "Ana", telefono: "2" });
    const lista = await listarClientes(db);
    expect(lista.map((c) => c.nombre)).toEqual(["Ana", "Zoe"]);
  });

  it("actualiza campos parcialmente", async () => {
    const creado = await crearCliente(db, { nombre: "Ana Pérez", telefono: "+51999111222" });
    const actualizado = await actualizarCliente(db, creado.id, { notas: "prefiere WhatsApp" });
    expect(actualizado.notas).toBe("prefiere WhatsApp");
    expect(actualizado.telefono).toBe("+51999111222");
  });

  it("lanza ClienteNoEncontradoError al actualizar un id inexistente", async () => {
    await expect(actualizarCliente(db, 9999, { notas: "x" })).rejects.toBeInstanceOf(
      ClienteNoEncontradoError,
    );
  });
});
