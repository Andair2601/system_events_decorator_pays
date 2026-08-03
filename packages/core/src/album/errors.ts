export class AlbumFotoNoEncontradaError extends Error {
  constructor(public readonly fotoId: number) {
    super(`Foto ${fotoId} no encontrada`);
    this.name = "AlbumFotoNoEncontradaError";
  }
}
