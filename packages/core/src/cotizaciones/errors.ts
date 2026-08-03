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

export class CotizacionEnUsoError extends Error {
  constructor(public readonly cotizacionId: number) {
    super(
      `La cotización ${cotizacionId} tiene una reserva asociada y no se puede eliminar; cancela` +
        ` o elimina la reserva primero.`,
    );
    this.name = "CotizacionEnUsoError";
  }
}

export class CotizacionNoEditableError extends Error {
  constructor(
    public readonly cotizacionId: number,
    public readonly estadoActual: string,
  ) {
    super(
      `La cotización ${cotizacionId} está en estado "${estadoActual}"; solo se puede editar` +
        ` mientras está en "borrador" (para no cambiar el precio después de que el cliente ya` +
        ` la vio o la aceptó)`,
    );
    this.name = "CotizacionNoEditableError";
  }
}
