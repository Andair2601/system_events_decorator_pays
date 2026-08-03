import type {
  CotizacionEstado,
  CotizacionOrigen,
  MaterialCategoria,
  MaterialUnidad,
  ReservaEstado,
  ReservaEstadoPago,
  TipoEvento,
} from "@deco-eventos/core/src/db/enums.js";

// Los campos monetarios llegan como string "0.00" (NUMERIC de Postgres via
// Decimal.toFixed(2) en el backend), no como number, para no perder precisión.

export interface Material {
  id: number;
  nombre: string;
  categoria: MaterialCategoria;
  costoUnitario: string;
  unidad: MaterialUnidad;
  imagenUrl: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  email: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfiguracionCosteo {
  id: number;
  tarifaManoObraHora: string;
  margenDefaultPct: string;
  tarifaTransporteDefault: string;
  updatedAt: string;
}

export interface CotizacionItem {
  id: number;
  cotizacionId: number;
  materialId: number;
  cantidad: string;
  costoUnitarioSnapshot: string;
  subtotal: string;
}

export interface Cotizacion {
  id: number;
  clienteId: number;
  nombreEvento: string;
  tipoEvento: TipoEvento;
  imagenReferenciaUrl: string | null;
  horasManoObraEstimadas: string;
  costoManoObra: string;
  costoTransporte: string;
  margenPctAplicado: string;
  costoMaterialesTotal: string;
  descuentoMonto: string;
  precioFinal: string;
  estado: CotizacionEstado;
  origen: CotizacionOrigen;
  createdAt: string;
  updatedAt: string;
}

export interface CotizacionConItems extends Cotizacion {
  items: CotizacionItem[];
}

export interface AlbumFoto {
  id: number;
  categoria: TipoEvento;
  reservaId: number | null;
  s3Key: string;
  url: string;
  destacada: boolean;
  createdAt: string;
}

export interface Reserva {
  id: number;
  cotizacionId: number | null;
  clienteId: number;
  fechaEvento: string;
  horaEvento: string | null;
  lugar: string;
  estado: ReservaEstado;
  estadoPago: ReservaEstadoPago;
  montoPagado: string;
  // Derivados del precio_final de la cotización asociada (join); solo
  // vienen presentes en las respuestas de listar/obtener.
  montoTotal?: string | null;
  montoPendiente?: string | null;
  calendarEventId: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
}
