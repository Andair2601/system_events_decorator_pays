export class DescuentoInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DescuentoInvalidoError";
  }
}
