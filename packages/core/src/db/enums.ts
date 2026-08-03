export const MATERIAL_CATEGORIAS = [
  "globos",
  "estructura",
  "telas",
  "iluminacion",
  "letras",
  "mobiliario",
  "pirotecnia",
  "sonido",
  "maquinaria",
  "flores",
  "otros",
] as const;
export type MaterialCategoria = (typeof MATERIAL_CATEGORIAS)[number];

export const MATERIAL_UNIDADES = ["pieza", "metro", "m2", "hora", "kit","unidad", "bolsa"] as const;
export type MaterialUnidad = (typeof MATERIAL_UNIDADES)[number];

export const TIPOS_EVENTO = [
  "cumpleanos_infantil",
  "cumpleanos_adulto",
  "baby_shower",
  "gender_reveal",
  "matrimonio",
  "imposicion_casacas",
  "promocion",
  "compromiso",
  "pedida_mano",
  "aniversario",
  "quince_anos",
  "bautizo",
  "otro",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const COTIZACION_ESTADOS = ["borrador", "enviada", "aceptada", "rechazada"] as const;
export type CotizacionEstado = (typeof COTIZACION_ESTADOS)[number];

export const COTIZACION_ORIGENES = ["manual", "whatsapp_agente"] as const;
export type CotizacionOrigen = (typeof COTIZACION_ORIGENES)[number];

export const RESERVA_ESTADOS = ["confirmada", "en_progreso", "completada", "cancelada"] as const;
export type ReservaEstado = (typeof RESERVA_ESTADOS)[number];

export const RESERVA_ESTADOS_PAGO = ["pendiente", "parcial", "pagado"] as const;
export type ReservaEstadoPago = (typeof RESERVA_ESTADOS_PAGO)[number];
