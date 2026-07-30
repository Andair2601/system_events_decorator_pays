import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema.js";

// Tipo driver-agnóstico: lo satisfacen tanto el cliente postgres-js real
// (producción) como el cliente pglite en memoria (tests), para que los
// servicios de packages/core no queden atados a un driver concreto.
export type Database = PgDatabase<PgQueryResultHKT, typeof schema, any>;
