export class ReservaNoEncontradaError extends Error {
  constructor(public readonly reservaId: number) {
    super(`Reserva ${reservaId} no encontrada`);
    this.name = "ReservaNoEncontradaError";
  }
}
