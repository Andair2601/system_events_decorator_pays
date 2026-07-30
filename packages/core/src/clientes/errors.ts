export class ClienteNoEncontradoError extends Error {
  constructor(public readonly clienteId: number) {
    super(`Cliente ${clienteId} no encontrado`);
    this.name = "ClienteNoEncontradoError";
  }
}
