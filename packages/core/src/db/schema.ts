import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  time,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  COTIZACION_ESTADOS,
  COTIZACION_ORIGENES,
  MATERIAL_CATEGORIAS,
  MATERIAL_UNIDADES,
  RESERVA_ESTADOS,
  RESERVA_ESTADOS_PAGO,
  RESERVA_ITEM_ORIGENES,
  TIPOS_EVENTO,
} from "./enums.js";

// NUMERIC se mapea a string (no number) para no perder precisión con dinero;
// la aritmética de cotizaciones se hace con una lib de decimales, no floats de JS.

export const clientes = pgTable("clientes", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono").notNull().unique(),
  email: text("email"),
  notas: text("notas"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const materiales = pgTable(
  "materiales",
  {
    id: serial("id").primaryKey(),
    nombre: text("nombre").notNull(),
    categoria: text("categoria").notNull(),
    costoUnitario: numeric("costo_unitario", { precision: 12, scale: 2 }).notNull(),
    unidad: text("unidad").notNull(),
    imagenUrl: text("imagen_url"),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("materiales_categoria_check", sql`${table.categoria} in ('${sql.raw(MATERIAL_CATEGORIAS.join("','"))}')`),
    check("materiales_unidad_check", sql`${table.unidad} in ('${sql.raw(MATERIAL_UNIDADES.join("','"))}')`),
    check("materiales_costo_unitario_check", sql`${table.costoUnitario} >= 0`),
    index("idx_materiales_categoria").on(table.categoria).where(sql`${table.activo}`),
  ],
);

export const configuracionCosteo = pgTable("configuracion_costeo", {
  id: serial("id").primaryKey(),
  tarifaManoObraHora: numeric("tarifa_mano_obra_hora", { precision: 12, scale: 2 }).notNull(),
  margenDefaultPct: numeric("margen_default_pct", { precision: 5, scale: 2 }).notNull(),
  tarifaTransporteDefault: numeric("tarifa_transporte_default", {
    precision: 12,
    scale: 2,
  }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cotizaciones = pgTable(
  "cotizaciones",
  {
    id: serial("id").primaryKey(),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    nombreEvento: text("nombre_evento").notNull(),
    tipoEvento: text("tipo_evento").notNull(),
    imagenReferenciaUrl: text("imagen_referencia_url"), // Fase 2/4
    horasManoObraEstimadas: numeric("horas_mano_obra_estimadas", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    costoManoObra: numeric("costo_mano_obra", { precision: 12, scale: 2 }).notNull().default("0"),
    costoTransporte: numeric("costo_transporte", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    margenPctAplicado: numeric("margen_pct_aplicado", { precision: 5, scale: 2 }).notNull(),
    costoMaterialesTotal: numeric("costo_materiales_total", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    // Monto fijo en soles, no porcentaje: se resta directo del total ya
    // calculado (materiales + mano de obra + transporte + margen).
    descuentoMonto: numeric("descuento_monto", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    precioFinal: numeric("precio_final", { precision: 12, scale: 2 }).notNull().default("0"),
    estado: text("estado").notNull().default("borrador"),
    origen: text("origen").notNull().default("manual"), // Fase 4: whatsapp_agente
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("cotizaciones_tipo_evento_check", sql`${table.tipoEvento} in ('${sql.raw(TIPOS_EVENTO.join("','"))}')`),
    check("cotizaciones_estado_check", sql`${table.estado} in ('${sql.raw(COTIZACION_ESTADOS.join("','"))}')`),
    check("cotizaciones_origen_check", sql`${table.origen} in ('${sql.raw(COTIZACION_ORIGENES.join("','"))}')`),
    check("cotizaciones_descuento_monto_check", sql`${table.descuentoMonto} >= 0`),
    index("idx_cotizaciones_cliente").on(table.clienteId),
    index("idx_cotizaciones_estado").on(table.estado),
  ],
);

export const cotizacionItems = pgTable(
  "cotizacion_items",
  {
    id: serial("id").primaryKey(),
    cotizacionId: integer("cotizacion_id")
      .notNull()
      .references(() => cotizaciones.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => materiales.id, { onDelete: "restrict" }),
    cantidad: numeric("cantidad", { precision: 10, scale: 2 }).notNull(),
    costoUnitarioSnapshot: numeric("costo_unitario_snapshot", {
      precision: 12,
      scale: 2,
    }).notNull(),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  },
  (table) => [
    check("cotizacion_items_cantidad_check", sql`${table.cantidad} > 0`),
    index("idx_cotizacion_items_cotizacion").on(table.cotizacionId),
  ],
);

export const reservas = pgTable(
  "reservas",
  {
    id: serial("id").primaryKey(),
    // Nullable a propósito: hoy toda reserva nace de una cotización aceptada,
    // pero el negocio puede querer reservar sin cotización previa más adelante.
    cotizacionId: integer("cotizacion_id").references(() => cotizaciones.id, {
      onDelete: "restrict",
    }),
    clienteId: integer("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    fechaEvento: date("fecha_evento").notNull(),
    horaEvento: time("hora_evento"),
    lugar: text("lugar").notNull(),
    estado: text("estado").notNull().default("confirmada"),
    estadoPago: text("estado_pago").notNull().default("pendiente"),
    montoPagado: numeric("monto_pagado", { precision: 12, scale: 2 }).notNull().default("0"),
    calendarEventId: text("calendar_event_id"), // Fase 3
    notas: text("notas"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("reservas_estado_check", sql`${table.estado} in ('${sql.raw(RESERVA_ESTADOS.join("','"))}')`),
    check("reservas_estado_pago_check", sql`${table.estadoPago} in ('${sql.raw(RESERVA_ESTADOS_PAGO.join("','"))}')`),
    index("idx_reservas_fecha").on(table.fechaEvento),
    index("idx_reservas_cliente").on(table.clienteId),
  ],
);

// Checklist de preparación de una reserva: los ítems "cotizacion" se
// copian (snapshot) de cotizacion_items al crear la reserva o, para
// reservas creadas antes de que existiera esta tabla, en el primer
// GET .../detalle (ver reservas/service.ts). Los "adicional" los agrega
// el usuario a mano y son los únicos que se pueden eliminar — los
// "cotizacion" solo se marcan/desmarcan, para que el checklist siga
// siendo un registro fiel de lo que se cotizó.
export const reservaItems = pgTable(
  "reserva_items",
  {
    id: serial("id").primaryKey(),
    reservaId: integer("reserva_id")
      .notNull()
      .references(() => reservas.id, { onDelete: "cascade" }),
    materialId: integer("material_id").references(() => materiales.id, { onDelete: "set null" }),
    descripcion: text("descripcion").notNull(),
    cantidad: numeric("cantidad", { precision: 10, scale: 2 }),
    completado: boolean("completado").notNull().default(false),
    origen: text("origen").notNull().default("adicional"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("reserva_items_origen_check", sql`${table.origen} in ('${sql.raw(RESERVA_ITEM_ORIGENES.join("','"))}')`),
    index("idx_reserva_items_reserva").on(table.reservaId),
  ],
);

export const albumFotos = pgTable(
  "album_fotos",
  {
    id: serial("id").primaryKey(),
    categoria: text("categoria").notNull(),
    reservaId: integer("reserva_id").references(() => reservas.id, { onDelete: "set null" }),
    s3Key: text("s3_key").notNull(),
    url: text("url").notNull(),
    destacada: boolean("destacada").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("album_fotos_categoria_check", sql`${table.categoria} in ('${sql.raw(TIPOS_EVENTO.join("','"))}')`),
    index("idx_album_categoria").on(table.categoria),
  ],
);
