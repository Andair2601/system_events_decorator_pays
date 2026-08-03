export class MaterialNoEncontradoError extends Error {
  constructor(public readonly materialId: number) {
    super(`Material ${materialId} no encontrado`);
    this.name = "MaterialNoEncontradoError";
  }
}

export class MaterialEnUsoError extends Error {
  constructor(public readonly materialId: number) {
    super(
      `El material ${materialId} está siendo usado en una o más cotizaciones y no se puede eliminar; desactívalo en su lugar.`,
    );
    this.name = "MaterialEnUsoError";
  }
}
