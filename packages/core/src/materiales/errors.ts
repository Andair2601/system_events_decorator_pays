export class MaterialNoEncontradoError extends Error {
  constructor(public readonly materialId: number) {
    super(`Material ${materialId} no encontrado`);
    this.name = "MaterialNoEncontradoError";
  }
}
