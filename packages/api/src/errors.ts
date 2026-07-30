import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import {
  ClienteNoEncontradoError,
  CotizacionNoAceptadaError,
  CotizacionNoEncontradaError,
  MaterialInexistenteError,
  MaterialNoEncontradoError,
  ReservaNoEncontradaError,
} from "@deco-eventos/core";
import { BadRequestError } from "./utils/params.js";

// Handler centralizado: los servicios de packages/core lanzan errores de
// dominio (Not Found, reglas de negocio) y errores de validación de Zod;
// acá se traducen a códigos HTTP una sola vez en vez de repetir try/catch
// en cada ruta.
export function handleError(err: Error, c: Context) {
  if (err instanceof ZodError) {
    return c.json({ error: "Datos inválidos", detalles: err.issues }, 400);
  }
  if (err instanceof BadRequestError || err instanceof MaterialInexistenteError) {
    return c.json({ error: err.message }, 400);
  }
  if (
    err instanceof MaterialNoEncontradoError ||
    err instanceof ClienteNoEncontradoError ||
    err instanceof CotizacionNoEncontradaError ||
    err instanceof ReservaNoEncontradaError
  ) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof CotizacionNoAceptadaError) {
    return c.json({ error: err.message }, 409);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
  return c.json({ error: "Error interno del servidor" }, 500);
}
