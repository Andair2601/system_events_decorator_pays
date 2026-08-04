export class ReservaNoEncontradaError extends Error {
  constructor(public readonly reservaId: number) {
    super(`Reserva ${reservaId} no encontrada`);
    this.name = "ReservaNoEncontradaError";
  }
}

export class ReservaItemNoEncontradoError extends Error {
  constructor(public readonly itemId: number) {
    super(`Ítem ${itemId} no encontrado`);
    this.name = "ReservaItemNoEncontradoError";
  }
}

export class ReservaItemFijoError extends Error {
  constructor(public readonly itemId: number) {
    super(
      `El ítem ${itemId} viene de la cotización y no se puede eliminar; solo se puede marcar` +
        ` o desmarcar.`,
    );
    this.name = "ReservaItemFijoError";
  }
}
