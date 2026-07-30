export class MaterialInexistenteError extends Error {
  constructor(public readonly materialId: number) {
    super(`El material ${materialId} no existe o está inactivo`);
    this.name = "MaterialInexistenteError";
  }
}

export class CotizacionNoEncontradaError extends Error {
  constructor(public readonly cotizacionId: number) {
    super(`Cotización ${cotizacionId} no encontrada`);
    this.name = "CotizacionNoEncontradaError";
  }
}

export class CotizacionNoAceptadaError extends Error {
  constructor(
    public readonly cotizacionId: number,
    public readonly estadoActual: string,
  ) {
    super(
      `La cotización ${cotizacionId} está en estado "${estadoActual}"; solo una cotización` +
        ` "aceptada" puede convertirse en reserva`,
    );
    this.name = "CotizacionNoAceptadaError";
  }
}
